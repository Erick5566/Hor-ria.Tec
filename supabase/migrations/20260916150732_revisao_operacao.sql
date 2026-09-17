begin;
-- Audita ajustes manuais e peças efetivamente aplicadas, sem baixar estoque ao orçar.
create function private.auditar_estoque() returns trigger language plpgsql security definer set search_path='' as $$
declare delta integer; oid uuid;begin
 delta:=new.quantidade-case when TG_OP='INSERT' then 0 else old.quantidade end;
 if delta<>0 then
  oid:=nullif(current_setting('horaria.ordem_estoque',true),'')::uuid;
  insert into public.movimentos_estoque(empresa_id,peca_id,ordem_id,quantidade,motivo) values(new.empresa_id,new.id,oid,delta,case when oid is null then 'Ajuste de estoque' else 'Peça aplicada no reparo' end);
  if oid is not null then insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,usuario_id,autor) values(new.empresa_id,oid,'Peça aplicada',new.nome||' · '||abs(delta)||' unidade(s)',auth.uid(),'Equipe técnica');end if;
 end if;return new;end $$;
create trigger auditar_estoque after insert or update on public.pecas for each row execute function private.auditar_estoque();
create function public.aplicar_peca(p_ordem uuid,p_peca uuid,p_quantidade integer) returns void language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico;p public.pecas;begin
 select * into strict o from public.ordens_servico where id=p_ordem for update;
 if not exists(select 1 from public.empresas where id=o.empresa_id and dono_id=auth.uid()) then raise exception 'Ordem não autorizada';end if;
 if o.status in ('finalizado','cancelado') then raise exception 'Ordem encerrada';end if;
 select * into strict p from public.pecas where id=p_peca and empresa_id=o.empresa_id for update;
 if p_quantidade is null or p_quantidade<1 or p.quantidade<p_quantidade then raise exception 'Quantidade indisponível no estoque';end if;
 perform set_config('horaria.ordem_estoque',o.id::text,true);
 update public.pecas set quantidade=quantidade-p_quantidade where id=p.id;
 perform set_config('horaria.ordem_estoque','',true);
end $$;
create function private.auditar_financeiro() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.ordem_id is not null then insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,usuario_id,autor) values(new.empresa_id,new.ordem_id,case when TG_OP='INSERT' then 'Lançamento financeiro criado' else 'Lançamento financeiro atualizado' end,new.descricao||' · '||new.status,auth.uid(),'Equipe técnica');end if;return new;end $$;
create trigger auditar_financeiro after insert or update on public.financeiro for each row execute function private.auditar_financeiro();
create function private.validar_aprovacao() returns trigger language plpgsql security definer set search_path='' as $$
declare estado text;begin
 if new.status is distinct from old.status and new.status in ('orcamento_aprovado','em_reparo','aguardando_peca','em_testes','pronto_retirada','finalizado') then
  select status into estado from public.orcamentos where ordem_id=new.id order by versao desc limit 1;
  if (estado is not null and estado<>'aprovado') or (new.status='orcamento_aprovado' and estado is null) then raise exception 'Aprove o orçamento vigente antes de avançar o reparo';end if;
 end if;return new;end $$;
create trigger validar_aprovacao before update on public.ordens_servico for each row execute function private.validar_aprovacao();
revoke all on function private.auditar_estoque(),private.auditar_financeiro(),private.validar_aprovacao(),public.aplicar_peca(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.aplicar_peca(uuid,uuid,integer) to authenticated;
alter table public.empresas add constraint slug_rotas_reservadas check(slug not in ('painel','agendar','acompanhar','api')) not valid;
-- Histórico público projeta apenas estados conhecidos, nunca observações internas.
create or replace function public.consultar_reparo(p_codigo text,p_telefone text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('numero',o.numero,'status',o.status,'previsao',o.previsao,'empresa',e.nome,'equipamento',jsonb_build_object('categoria',eq.categoria,'marca',eq.marca,'modelo',eq.modelo),'orcamento',(select jsonb_build_object('id',q.id,'versao',q.versao,'servicos',q.servicos,'pecas',q.pecas,'mao_obra',q.mao_obra,'desconto',q.desconto,'total',q.total,'validade',q.validade,'status',q.status) from public.orcamentos q where q.ordem_id=o.id and q.status<>'rascunho' and not exists(select 1 from public.orcamentos newer where newer.ordem_id=o.id and newer.versao>q.versao) order by q.versao desc limit 1),'historico',coalesce((select jsonb_agg(jsonb_build_object('evento',h.evento,'status',case when h.evento in ('Ordem criada','Status alterado') then h.detalhes else null end,'data',h.criado_em) order by h.criado_em) from public.historico_os h where h.ordem_id=o.id and h.publico),'[]'::jsonb))
 from public.ordens_servico o join public.clientes c on c.id=o.cliente_id join public.equipamentos eq on eq.id=o.equipamento_id join public.empresas e on e.id=o.empresa_id where length(p_codigo)=16 and o.codigo_publico=upper(p_codigo) and c.whatsapp=regexp_replace(p_telefone,'\D','','g')
$$;
commit;
