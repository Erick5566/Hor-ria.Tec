begin;

alter table public.empresas add column google_avaliacao_url text;
alter table public.pecas add column na_vitrine boolean not null default false, add column descricao_vitrine text;

create table public.seminovos (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null references public.empresas(id),vendedor_id uuid,comprador_id uuid,
 categoria text not null,marca text not null default '',modelo text not null,cor text,imei text,numero_serie text,estado text,checklist text[] not null default '{}',foto_urls text[] not null default '{}',documentacao text,observacoes text,
 status text not null default 'em_avaliacao' check(status in ('em_avaliacao','em_manutencao','pronto_venda','reservado','vendido','descartado')),
 valor_estimado numeric(12,2) not null default 0 check(valor_estimado>=0),valor_compra numeric(12,2) not null default 0 check(valor_compra>=0),custos_reparo numeric(12,2) not null default 0 check(custos_reparo>=0),preco_venda numeric(12,2) not null default 0 check(preco_venda>=0),valor_vendido numeric(12,2),forma_pagamento text,garantia_fim date,na_vitrine boolean not null default false,
 adquirido_em timestamptz not null default now(),vendido_em timestamptz,criado_por uuid default auth.uid() references auth.users(id),
 unique(id,empresa_id),foreign key(vendedor_id,empresa_id) references public.clientes(id,empresa_id),foreign key(comprador_id,empresa_id) references public.clientes(id,empresa_id)
);

create table public.pos_venda (
 id uuid primary key default gen_random_uuid(),empresa_id uuid not null,cliente_id uuid not null,ordem_id uuid,venda_id uuid,seminovo_id uuid,
 tipo text not null check(tipo in ('reparo','venda','seminovo')),disponivel_em date not null,status text not null default 'pendente' check(status in ('pendente','contatado','concluido','dispensado')),mensagem text,contatado_em timestamptz,criado_em timestamptz not null default now(),
 unique(id,empresa_id),foreign key(cliente_id,empresa_id) references public.clientes(id,empresa_id),foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id),foreign key(venda_id,empresa_id) references public.vendas(id,empresa_id),foreign key(seminovo_id,empresa_id) references public.seminovos(id,empresa_id)
);

create index seminovos_empresa_status_idx on public.seminovos(empresa_id,status,adquirido_em desc);
create index pos_venda_empresa_status_idx on public.pos_venda(empresa_id,status,disponivel_em);
create unique index pos_venda_ordem_unique on public.pos_venda(ordem_id) where ordem_id is not null;
create unique index pos_venda_venda_unique on public.pos_venda(venda_id) where venda_id is not null;
create unique index pos_venda_seminovo_unique on public.pos_venda(seminovo_id) where seminovo_id is not null;

do $$declare tabela text;begin
 foreach tabela in array array['seminovos','pos_venda'] loop
  execute format('alter table public.%I enable row level security',tabela);execute format('revoke all on public.%I from anon,authenticated',tabela);execute format('grant select,insert,update on public.%I to authenticated',tabela);
  execute format('create policy tenant_member_select on public.%I for select to authenticated using(private.can_access_company(empresa_id))',tabela);
  execute format('create policy tenant_member_insert on public.%I for insert to authenticated with check(private.can_access_company(empresa_id))',tabela);
  execute format('create policy tenant_member_update on public.%I for update to authenticated using(private.can_access_company(empresa_id)) with check(private.can_access_company(empresa_id))',tabela);
  execute format('create trigger enforce_company_write before insert or update or delete on public.%I for each row execute function private.enforce_operational_company_write()',tabela);
 end loop;
end $$;

create or replace function public.vender_seminovo(p_seminovo uuid,p_comprador uuid,p_valor numeric,p_forma text,p_garantia_dias integer default 90) returns void language plpgsql security definer set search_path='' as $$
declare s public.seminovos;begin
 select * into strict s from public.seminovos where id=p_seminovo for update;
 if not private.can_access_company(s.empresa_id) then raise exception 'Aparelho não autorizado';end if;
 if s.status not in ('pronto_venda','reservado') or p_valor<=0 or p_forma not in ('pix','dinheiro','credito','debito','outro') or p_garantia_dias not between 0 and 730 then raise exception 'Venda inválida';end if;
 if p_comprador is null or not exists(select 1 from public.clientes where id=p_comprador and empresa_id=s.empresa_id) then raise exception 'Comprador inválido';end if;
 update public.seminovos set comprador_id=p_comprador,status='vendido',valor_vendido=p_valor,forma_pagamento=p_forma,garantia_fim=current_date+p_garantia_dias,vendido_em=now(),na_vitrine=false where id=s.id;
 insert into public.financeiro(empresa_id,descricao,tipo,valor,status,vencimento,pago_em,origem) values(s.empresa_id,'Venda de seminovo · '||trim(concat_ws(' ',s.marca,s.modelo)),'receita',p_valor,'pago',current_date,current_date,'seminovo');
 insert into public.pos_venda(empresa_id,cliente_id,seminovo_id,tipo,disponivel_em) values(s.empresa_id,p_comprador,s.id,'seminovo',current_date+7);
end $$;

create or replace function private.criar_pos_venda_os() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='finalizado' and old.status is distinct from new.status then insert into public.pos_venda(empresa_id,cliente_id,ordem_id,tipo,disponivel_em) values(new.empresa_id,new.cliente_id,new.id,'reparo',current_date+7) on conflict do nothing;end if;return new;end $$;
create trigger criar_pos_venda_os after update on public.ordens_servico for each row execute function private.criar_pos_venda_os();

create or replace function private.criar_pos_venda_venda() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='finalizada' and new.cliente_id is not null and new.total>0 and (old.total is distinct from new.total or old.cliente_id is distinct from new.cliente_id) then
  insert into public.pos_venda(empresa_id,cliente_id,venda_id,tipo,disponivel_em) values(new.empresa_id,new.cliente_id,new.id,'venda',current_date+7) on conflict do nothing;
 end if;return new;
end $$;
create trigger criar_pos_venda_venda after update on public.vendas for each row execute function private.criar_pos_venda_venda();

create or replace function public.vitrine_publica(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('produtos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'descricao',coalesce(p.descricao_vitrine,p.descricao),'preco',p.preco,'foto',p.foto_url,'condicao','Novo') order by p.nome) from public.pecas p where p.empresa_id=e.id and p.na_vitrine and p.ativo and p.quantidade>0),'[]'::jsonb),'seminovos',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'nome',trim(concat_ws(' ',s.marca,s.modelo)),'descricao',s.estado,'preco',s.preco_venda,'foto',s.foto_urls[1],'condicao','Seminovo','garantia_fim',s.garantia_fim) order by s.adquirido_em desc) from public.seminovos s where s.empresa_id=e.id and s.na_vitrine and s.status='pronto_venda'),'[]'::jsonb),'whatsapp',coalesce(e.whatsapp,e.telefone)) from public.empresas e where e.slug=p_slug and private.public_company_available(e.id)
$$;

revoke all on function public.vender_seminovo(uuid,uuid,numeric,text,integer),public.vitrine_publica(text) from public,anon,authenticated;
grant execute on function public.vender_seminovo(uuid,uuid,numeric,text,integer) to authenticated;
grant execute on function public.vitrine_publica(text) to anon,authenticated;

commit;
