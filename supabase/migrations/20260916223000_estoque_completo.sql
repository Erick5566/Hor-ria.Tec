begin;

alter table public.pecas
 add column tipo text not null default 'Peça' check(tipo in ('Peça','Acessório','Produto')),
 add column categoria text not null default 'Outros',
 add column sku text,
 add column codigo_barras text,
 add column unidade text not null default 'un' check(unidade in ('un','kit','par','m','caixa')),
 add column ativo boolean not null default true;

create unique index pecas_empresa_sku_uidx on public.pecas(empresa_id,lower(sku)) where nullif(trim(sku),'') is not null;
create unique index pecas_empresa_codigo_barras_uidx on public.pecas(empresa_id,codigo_barras) where nullif(trim(codigo_barras),'') is not null;
create index pecas_empresa_tipo_categoria_idx on public.pecas(empresa_id,tipo,categoria) where ativo;

alter table public.movimentos_estoque
 add column usuario_id uuid default auth.uid() references auth.users(id);
create index movimentos_estoque_usuario_idx on public.movimentos_estoque(usuario_id);

create or replace function private.auditar_estoque() returns trigger language plpgsql security definer set search_path='' as $$
declare delta integer;oid uuid;motivo_movimento text;begin
 delta:=new.quantidade-case when TG_OP='INSERT' then 0 else old.quantidade end;
 if delta<>0 then
  oid:=nullif(current_setting('horaria.ordem_estoque',true),'')::uuid;
  motivo_movimento:=nullif(current_setting('horaria.motivo_estoque',true),'');
  insert into public.movimentos_estoque(empresa_id,peca_id,ordem_id,quantidade,motivo,usuario_id)
  values(new.empresa_id,new.id,oid,delta,coalesce(motivo_movimento,case when oid is null then 'Ajuste de estoque' else 'Peça aplicada no reparo' end),auth.uid());
  if oid is not null then
   insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,usuario_id,autor)
   values(new.empresa_id,oid,'Peça aplicada',new.nome||' · '||abs(delta)||' '||new.unidade||'(s)',auth.uid(),'Equipe técnica');
  end if;
 end if;return new;
end $$;

create function public.movimentar_estoque(p_peca uuid,p_quantidade integer,p_motivo text) returns integer language plpgsql security definer set search_path='' as $$
declare p public.pecas;nova_quantidade integer;begin
 select * into strict p from public.pecas where id=p_peca for update;
 if not exists(select 1 from public.empresas where id=p.empresa_id and dono_id=auth.uid()) then raise exception 'Item não autorizado';end if;
 if p_quantidade is null or p_quantidade=0 or abs(p_quantidade)>100000 then raise exception 'Quantidade inválida';end if;
 if length(trim(coalesce(p_motivo,''))) not between 2 and 200 then raise exception 'Informe o motivo da movimentação';end if;
 nova_quantidade:=p.quantidade+p_quantidade;
 if nova_quantidade<0 then raise exception 'Estoque insuficiente. Disponível: %',p.quantidade;end if;
 perform set_config('horaria.motivo_estoque',trim(p_motivo),true);
 update public.pecas set quantidade=nova_quantidade where id=p.id;
 perform set_config('horaria.motivo_estoque','',true);
 return nova_quantidade;
end $$;

create or replace function public.registrar_peca_aplicada(p_ordem uuid,p_nome text,p_quantidade integer,p_peca uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico;p public.pecas;id_novo uuid;nome_final text;begin
 select * into strict o from public.ordens_servico where id=p_ordem for update;
 if not exists(select 1 from public.empresas where id=o.empresa_id and dono_id=auth.uid()) then raise exception 'Ordem não autorizada';end if;
 if o.status in ('finalizado','cancelado') then raise exception 'Ordem encerrada';end if;
 if p_quantidade is null or p_quantidade not between 1 and 1000 then raise exception 'Quantidade inválida';end if;
 nome_final:=trim(p_nome);
 if p_peca is not null then
  select * into strict p from public.pecas where id=p_peca and empresa_id=o.empresa_id and ativo for update;
  if p.quantidade<p_quantidade then raise exception 'Quantidade indisponível no estoque';end if;
  if length(nome_final)<2 then nome_final:=p.nome;end if;
  perform set_config('horaria.ordem_estoque',o.id::text,true);
  perform set_config('horaria.motivo_estoque','Uso na OS #'||o.numero,true);
  update public.pecas set quantidade=quantidade-p_quantidade where id=p.id;
  perform set_config('horaria.ordem_estoque','',true);
  perform set_config('horaria.motivo_estoque','',true);
 end if;
 if length(nome_final) not between 2 and 200 then raise exception 'Informe a peça utilizada';end if;
 insert into public.pecas_aplicadas(empresa_id,ordem_id,peca_id,nome,quantidade) values(o.empresa_id,o.id,p_peca,nome_final,p_quantidade) returning id into id_novo;
 if p_peca is null then insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,usuario_id,autor) values(o.empresa_id,o.id,'Peça aplicada',nome_final||' · '||p_quantidade||' unidade(s)',auth.uid(),'Equipe técnica');end if;
 return id_novo;
end $$;

revoke all on function public.movimentar_estoque(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.movimentar_estoque(uuid,integer,text) to authenticated;

commit;
