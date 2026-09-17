begin;
create function public.salvar_orcamento(p_ordem uuid,p_servicos jsonb,p_pecas jsonb,p_mao_obra numeric,p_desconto numeric,p_validade date) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico;item jsonb;soma numeric:=0;v integer;q uuid;begin
 select * into strict o from public.ordens_servico where id=p_ordem for update;
 if not exists(select 1 from public.empresas where id=o.empresa_id and dono_id=auth.uid()) then raise exception 'Ordem não autorizada';end if;
 if o.status in ('finalizado','cancelado') then raise exception 'Esta ordem está encerrada';end if;
 if p_servicos is null or p_pecas is null or jsonb_typeof(p_servicos)<>'array' or jsonb_typeof(p_pecas)<>'array' or jsonb_array_length(p_servicos)+jsonb_array_length(p_pecas)>100 then raise exception 'Itens inválidos';end if;
 if p_mao_obra is null or p_desconto is null or p_mao_obra<0 or p_desconto<0 or p_mao_obra>10000000 or p_desconto>10000000 or p_validade is null or p_validade<current_date then raise exception 'Valores ou validade inválidos';end if;
 for item in select * from jsonb_array_elements(p_servicos||p_pecas) loop
  if coalesce(length(trim(item->>'nome')),0)<2 or (item->>'quantidade') is null or (item->>'valor') is null or (item->>'quantidade')::numeric<>trunc((item->>'quantidade')::numeric) or (item->>'quantidade')::numeric not between 1 and 1000 or (item->>'valor')::numeric not between 0 and 10000000 then raise exception 'Item inválido';end if;
  if nullif(item->>'peca_id','') is not null and not exists(select 1 from public.pecas where id=(item->>'peca_id')::uuid and empresa_id=o.empresa_id) then raise exception 'Peça não autorizada';end if;
  if nullif(item->>'servico_id','') is not null and not exists(select 1 from public.servicos where id=(item->>'servico_id')::uuid and empresa_id=o.empresa_id) then raise exception 'Serviço não autorizado';end if;
  soma:=soma+(item->>'quantidade')::numeric*round((item->>'valor')::numeric,2);
 end loop;
 soma:=round(soma+p_mao_obra-p_desconto,2);if soma<0 then raise exception 'Desconto maior que o orçamento';end if;
 select coalesce(max(versao),0)+1 into v from public.orcamentos where ordem_id=p_ordem;
 insert into public.orcamentos(empresa_id,ordem_id,versao,servicos,pecas,mao_obra,desconto,total,validade) values(o.empresa_id,o.id,v,p_servicos,p_pecas,p_mao_obra,p_desconto,soma,p_validade) returning id into q;
 update public.ordens_servico set status='aguardando_orcamento' where id=o.id;
 return q;end $$;
create function public.enviar_orcamento(p_orcamento uuid) returns void language plpgsql security definer set search_path='' as $$
declare q public.orcamentos;begin
 select * into strict q from public.orcamentos where id=p_orcamento for update;
 if not exists(select 1 from public.empresas where id=q.empresa_id and dono_id=auth.uid()) then raise exception 'Orçamento não autorizado';end if;
 if q.status<>'rascunho' or q.validade<current_date or exists(select 1 from public.orcamentos where ordem_id=q.ordem_id and versao>q.versao) then raise exception 'Este orçamento não pode ser enviado';end if;
 update public.orcamentos set status='enviado' where id=q.id;
 update public.ordens_servico set status='aguardando_aprovacao' where id=q.ordem_id;
end $$;
create function public.responder_orcamento(p_orcamento uuid,p_decisao text,p_observacao text default null,p_codigo text default null,p_telefone text default null) returns void language plpgsql security definer set search_path='' as $$
declare q public.orcamentos;o public.ordens_servico;begin
 select * into strict q from public.orcamentos where id=p_orcamento for update;
 select * into strict o from public.ordens_servico where id=q.ordem_id for update;
 if not exists(select 1 from public.empresas where id=q.empresa_id and dono_id=auth.uid()) and not exists(select 1 from public.clientes c where c.id=o.cliente_id and c.empresa_id=o.empresa_id and c.whatsapp=regexp_replace(p_telefone,'\D','','g') and o.codigo_publico=upper(p_codigo)) then raise exception 'Orçamento não encontrado';end if;
 if p_decisao not in ('aprovado','recusado','alteracao_solicitada') or p_decisao is null or length(coalesce(p_observacao,''))>1000 then raise exception 'Resposta inválida';end if;
 if q.status<>'enviado' or o.status in ('cancelado','finalizado') or exists(select 1 from public.orcamentos where ordem_id=q.ordem_id and versao>q.versao) then raise exception 'Este orçamento não aceita novas respostas';end if;
 if p_decisao='aprovado' and q.validade<current_date then raise exception 'Orçamento vencido. Solicite uma nova versão';end if;
 update public.orcamentos set status=p_decisao,resposta=p_observacao,respondido_em=now() where id=q.id;
 update public.ordens_servico set status=case when p_decisao='aprovado' then 'orcamento_aprovado' else 'aguardando_orcamento' end where id=o.id;
end $$;
create function private.auditar_orcamento() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,publico,usuario_id,autor) values(new.empresa_id,new.ordem_id,case when TG_OP='INSERT' then 'Orçamento criado' when new.status='enviado' then 'Orçamento enviado' when new.status='aprovado' then 'Orçamento aprovado' when new.status='recusado' then 'Orçamento recusado' else 'Alteração de orçamento solicitada' end,'Versão '||new.versao,new.status<>'rascunho',auth.uid(),case when auth.uid() is null then 'Cliente' else 'Equipe técnica' end);return new;end $$;
create trigger auditar_orcamento after insert or update on public.orcamentos for each row execute function private.auditar_orcamento();
revoke all on function public.salvar_orcamento(uuid,jsonb,jsonb,numeric,numeric,date),public.enviar_orcamento(uuid),public.responder_orcamento(uuid,text,text,text,text),private.auditar_orcamento() from public,anon,authenticated;
grant execute on function public.salvar_orcamento(uuid,jsonb,jsonb,numeric,numeric,date),public.enviar_orcamento(uuid) to authenticated;
grant execute on function public.responder_orcamento(uuid,text,text,text,text) to anon,authenticated;
commit;
