begin;

alter table public.empresas
  add column documento text,
  add column whatsapp text,
  add column email_publico text,
  add column instagram text,
  add column site text,
  add column logo_url text,
  add column cep text,
  add column numero_endereco text,
  add column complemento text,
  add column bairro text,
  add column cidade text,
  add column estado text,
  add column cor_primaria text not null default '#06141B' check(cor_primaria ~ '^#[0-9A-Fa-f]{6}$'),
  add column cor_secundaria text not null default '#253745' check(cor_secundaria ~ '^#[0-9A-Fa-f]{6}$'),
  add column cor_botao text not null default '#11212D' check(cor_botao ~ '^#[0-9A-Fa-f]{6}$'),
  add column tema_publico text not null default 'claro' check(tema_publico in ('claro','escuro'));

create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity(start with 1),
  empresa_id uuid not null references public.empresas(id),
  cliente_id uuid,
  status text not null default 'finalizada' check(status in ('finalizada','cancelada')),
  subtotal numeric(12,2) not null check(subtotal>=0),
  desconto numeric(12,2) not null default 0 check(desconto>=0),
  total numeric(12,2) not null check(total>=0),
  custo_total numeric(12,2) not null default 0 check(custo_total>=0),
  observacoes text,
  vendido_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users(id),
  unique(id,empresa_id),
  foreign key(cliente_id,empresa_id) references public.clientes(id,empresa_id)
);

create table public.venda_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  venda_id uuid not null,
  peca_id uuid not null,
  nome text not null,
  quantidade integer not null check(quantidade between 1 and 1000),
  custo_unitario numeric(12,2) not null check(custo_unitario>=0),
  preco_unitario numeric(12,2) not null check(preco_unitario>=0),
  total numeric(12,2) not null check(total>=0),
  foreign key(venda_id,empresa_id) references public.vendas(id,empresa_id),
  foreign key(peca_id,empresa_id) references public.pecas(id,empresa_id)
);

create table public.venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  venda_id uuid not null,
  forma text not null check(forma in ('pix','dinheiro','credito','debito','outro')),
  valor numeric(12,2) not null check(valor>0),
  recebido_em timestamptz not null default now(),
  foreign key(venda_id,empresa_id) references public.vendas(id,empresa_id)
);

alter table public.financeiro
  add column origem text not null default 'manual' check(origem in ('reparo','loja','seminovo','despesa','manual')),
  add column venda_id uuid,
  add foreign key(venda_id,empresa_id) references public.vendas(id,empresa_id);

alter table public.movimentos_estoque
  add column venda_id uuid,
  add foreign key(venda_id,empresa_id) references public.vendas(id,empresa_id);

create index vendas_empresa_data_idx on public.vendas(empresa_id,vendido_em desc);
create index vendas_cliente_idx on public.vendas(cliente_id,empresa_id);
create index venda_itens_venda_idx on public.venda_itens(venda_id,empresa_id);
create index venda_pagamentos_venda_idx on public.venda_pagamentos(venda_id,empresa_id);
create index financeiro_empresa_origem_idx on public.financeiro(empresa_id,origem,pago_em);

do $$declare tabela text;begin
 foreach tabela in array array['vendas','venda_itens','venda_pagamentos'] loop
  execute format('alter table public.%I enable row level security',tabela);
  execute format('revoke all on public.%I from anon,authenticated',tabela);
  execute format('grant select on public.%I to authenticated',tabela);
  execute format('create policy tenant_member_select on public.%I for select to authenticated using(private.can_access_company(empresa_id))',tabela);
  execute format('create trigger enforce_company_write before insert or update or delete on public.%I for each row execute function private.enforce_operational_company_write()',tabela);
 end loop;
end $$;

create or replace function private.auditar_estoque() returns trigger language plpgsql security definer set search_path='' as $$
declare delta integer;oid uuid;vid uuid;motivo_movimento text;begin
 delta:=new.quantidade-case when TG_OP='INSERT' then 0 else old.quantidade end;
 if delta<>0 then
  oid:=nullif(current_setting('horaria.ordem_estoque',true),'')::uuid;
  vid:=nullif(current_setting('horaria.venda_estoque',true),'')::uuid;
  motivo_movimento:=nullif(current_setting('horaria.motivo_estoque',true),'');
  insert into public.movimentos_estoque(empresa_id,peca_id,ordem_id,venda_id,quantidade,motivo,usuario_id)
  values(new.empresa_id,new.id,oid,vid,delta,coalesce(motivo_movimento,case when oid is not null then 'Peça aplicada no reparo' when vid is not null then 'Venda de produto' else 'Ajuste de estoque' end),auth.uid());
  if oid is not null then insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,usuario_id,autor) values(new.empresa_id,oid,'Peça aplicada',new.nome||' · '||abs(delta)||' '||new.unidade||'(s)',auth.uid(),'Equipe técnica');end if;
 end if;return new;
end $$;

create or replace function public.finalizar_venda(p_empresa uuid,p_cliente uuid,p_itens jsonb,p_desconto numeric,p_forma text,p_observacoes text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare venda public.vendas;produto public.pecas;item jsonb;qtd integer;preco numeric;v_subtotal numeric:=0;v_custo numeric:=0;begin
 if not private.can_access_company(p_empresa) then raise exception 'Empresa não autorizada';end if;
 if not private.feature_enabled(p_empresa,'stockEnabled') or not private.feature_enabled(p_empresa,'financialEnabled') then raise exception 'Estoque e financeiro precisam estar ativos';end if;
 if p_cliente is not null and not exists(select 1 from public.clientes where id=p_cliente and empresa_id=p_empresa) then raise exception 'Cliente inválido';end if;
 if p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 100 then raise exception 'Adicione ao menos um produto';end if;
 if coalesce(p_desconto,0)<0 or p_forma not in ('pix','dinheiro','credito','debito','outro') then raise exception 'Pagamento inválido';end if;
 insert into public.vendas(empresa_id,cliente_id,subtotal,desconto,total,custo_total,observacoes) values(p_empresa,p_cliente,0,coalesce(p_desconto,0),0,0,nullif(trim(p_observacoes),'')) returning * into venda;
 for item in select * from jsonb_array_elements(p_itens) loop
  qtd:=(item->>'quantidade')::integer;preco:=(item->>'preco')::numeric;
  select * into strict produto from public.pecas where id=(item->>'peca_id')::uuid and empresa_id=p_empresa and ativo for update;
  if qtd not between 1 and 1000 or preco<0 or produto.quantidade<qtd then raise exception 'Quantidade indisponível para %',produto.nome;end if;
  v_subtotal:=v_subtotal+qtd*preco;v_custo:=v_custo+qtd*produto.custo;
  insert into public.venda_itens(empresa_id,venda_id,peca_id,nome,quantidade,custo_unitario,preco_unitario,total) values(p_empresa,venda.id,produto.id,produto.nome,qtd,produto.custo,preco,qtd*preco);
  perform set_config('horaria.venda_estoque',venda.id::text,true);perform set_config('horaria.motivo_estoque','Venda #'||venda.numero,true);
  update public.pecas set quantidade=quantidade-qtd where id=produto.id;
  perform set_config('horaria.venda_estoque','',true);perform set_config('horaria.motivo_estoque','',true);
 end loop;
 if p_desconto>v_subtotal then raise exception 'Desconto maior que a venda';end if;
 update public.vendas set subtotal=v_subtotal,desconto=p_desconto,total=v_subtotal-p_desconto,custo_total=v_custo where id=venda.id returning * into venda;
 if venda.total>0 then
  insert into public.venda_pagamentos(empresa_id,venda_id,forma,valor) values(p_empresa,venda.id,p_forma,venda.total);
  insert into public.financeiro(empresa_id,venda_id,descricao,tipo,valor,status,vencimento,pago_em,origem) values(p_empresa,venda.id,'Venda #'||venda.numero,'receita',venda.total,'pago',current_date,current_date,'loja');
 end if;
 return jsonb_build_object('id',venda.id,'numero',venda.numero,'total',venda.total,'custo',venda.custo_total,'lucro',venda.total-venda.custo_total);
end $$;

create or replace function public.perfil_assistencia(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select public.catalogo(p_slug)||jsonb_build_object('telefone',e.telefone,'whatsapp',e.whatsapp,'email',e.email_publico,'endereco',e.endereco,'descricao',e.descricao_publica,'logo',e.logo_url,'instagram',e.instagram,'site',e.site,'fotos_obrigatorias',e.fotos_obrigatorias,'aparencia',jsonb_build_object('primaria',e.cor_primaria,'secundaria',e.cor_secundaria,'botao',e.cor_botao,'tema',e.tema_publico))
 from public.empresas e where e.slug=p_slug and private.public_company_available(e.id)
$$;

revoke all on function public.finalizar_venda(uuid,uuid,jsonb,numeric,text,text) from public,anon,authenticated;
grant execute on function public.finalizar_venda(uuid,uuid,jsonb,numeric,text,text) to authenticated;

commit;
