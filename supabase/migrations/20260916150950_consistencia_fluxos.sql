begin;
-- Ordem de bloqueios consistente e registro de upload idempotente.
create or replace function public.enviar_orcamento(p_orcamento uuid) returns void language plpgsql security definer set search_path='' as $$
declare q public.orcamentos;begin
 perform 1 from public.ordens_servico where id=(select ordem_id from public.orcamentos where id=p_orcamento) for update;
 select * into strict q from public.orcamentos where id=p_orcamento for update;
 if not exists(select 1 from public.empresas where id=q.empresa_id and dono_id=auth.uid()) then raise exception 'Orçamento não autorizado';end if;
 if exists(select 1 from public.ordens_servico where id=q.ordem_id and status in ('finalizado','cancelado')) or q.status<>'rascunho' or q.validade<current_date or exists(select 1 from public.orcamentos where ordem_id=q.ordem_id and versao>q.versao) then raise exception 'Este orçamento não pode ser enviado';end if;
 update public.orcamentos set status='enviado' where id=q.id;
 update public.ordens_servico set status='aguardando_aprovacao' where id=q.ordem_id;
end $$;
create or replace function public.responder_orcamento(p_orcamento uuid,p_decisao text,p_observacao text default null,p_codigo text default null,p_telefone text default null) returns void language plpgsql security definer set search_path='' as $$
declare q public.orcamentos;o public.ordens_servico;begin
 perform 1 from public.ordens_servico where id=(select ordem_id from public.orcamentos where id=p_orcamento) for update;
 select * into strict q from public.orcamentos where id=p_orcamento for update;
 select * into strict o from public.ordens_servico where id=q.ordem_id for update;
 if not exists(select 1 from public.empresas where id=q.empresa_id and dono_id=auth.uid()) and not exists(select 1 from public.clientes c where c.id=o.cliente_id and c.empresa_id=o.empresa_id and c.whatsapp=regexp_replace(p_telefone,'\D','','g') and o.codigo_publico=upper(p_codigo)) then raise exception 'Orçamento não encontrado';end if;
 if p_decisao not in ('aprovado','recusado','alteracao_solicitada') or p_decisao is null or length(coalesce(p_observacao,''))>1000 then raise exception 'Resposta inválida';end if;
 if q.status<>'enviado' or o.status in ('cancelado','finalizado') or exists(select 1 from public.orcamentos where ordem_id=q.ordem_id and versao>q.versao) then raise exception 'Este orçamento não aceita novas respostas';end if;
 if p_decisao='aprovado' and q.validade<current_date then raise exception 'Orçamento vencido. Solicite uma nova versão';end if;
 update public.orcamentos set status=p_decisao,resposta=p_observacao,respondido_em=now() where id=q.id;
 update public.ordens_servico set status=case when p_decisao='aprovado' then 'orcamento_aprovado' else 'aguardando_orcamento' end where id=o.id;
end $$;
create or replace function public.registrar_foto(p_caminho text,p_categoria text,p_descricao text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico; fid uuid; begin
 select * into o from public.ordens_servico where id::text=split_part(p_caminho,'/',2);
 if o.id is null or not exists(select 1 from public.empresas e where e.id=o.empresa_id and split_part(p_caminho,'/',1)=e.id::text and (e.dono_id=auth.uid() or exists(select 1 from private.upload_tickets t where t.ordem_id=o.id and t.token::text=split_part(p_caminho,'/',3) and t.expira_em>now()))) then raise exception 'Upload não autorizado';end if;
 if not exists(select 1 from storage.objects where bucket_id='os-fotos' and name=p_caminho) then raise exception 'Envie a imagem antes de registrá-la';end if;
 select id into fid from public.fotos_os where caminho=p_caminho;
 if fid is not null then return fid;end if;
 if length(coalesce(p_descricao,''))>1000 then raise exception 'Observação muito longa';end if;
 insert into public.fotos_os(empresa_id,ordem_id,caminho,url,categoria,descricao,usuario_id,autor) values(o.empresa_id,o.id,p_caminho,'storage://os-fotos/'||p_caminho,p_categoria,p_descricao,auth.uid(),case when auth.uid() is null then 'Cliente' else 'Equipe técnica' end) returning id into fid;
 insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,usuario_id,autor) values(o.empresa_id,o.id,'Foto adicionada',p_categoria,auth.uid(),case when auth.uid() is null then 'Cliente' else 'Equipe técnica' end);
 return fid;end $$;
commit;
