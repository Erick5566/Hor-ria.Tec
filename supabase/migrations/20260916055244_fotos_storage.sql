-- Storage privado com inserção sem sobrescrita e histórico de fotos.
begin;
create table private.upload_tickets(token uuid primary key default gen_random_uuid(),ordem_id uuid not null references public.ordens_servico(id),expira_em timestamptz not null default now()+interval '1 hour');
alter table private.upload_tickets enable row level security;
revoke all on private.upload_tickets from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('os-fotos','os-fotos',false,6291456,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create function private.pode_enviar_foto(p_caminho text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ordens_servico o join public.empresas e on e.id=o.empresa_id where split_part(p_caminho,'/',1)=e.id::text and split_part(p_caminho,'/',2)=o.id::text and (e.dono_id=auth.uid() or exists(select 1 from private.upload_tickets t where t.ordem_id=o.id and t.token::text=split_part(p_caminho,'/',3) and t.expira_em>now() and (select count(*) from storage.objects s where s.bucket_id='os-fotos' and s.name like e.id::text||'/'||o.id::text||'/'||t.token::text||'/%')<20)))
$$;
create function private.pode_ler_foto(p_caminho text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ordens_servico o join public.empresas e on e.id=o.empresa_id where e.dono_id=auth.uid() and split_part(p_caminho,'/',1)=e.id::text and split_part(p_caminho,'/',2)=o.id::text)
$$;
revoke all on function private.pode_enviar_foto(text),private.pode_ler_foto(text) from public,anon,authenticated;
grant usage on schema private to anon;
grant execute on function private.pode_enviar_foto(text) to anon,authenticated;
grant execute on function private.pode_ler_foto(text) to authenticated;
create policy horaria_fotos_insert on storage.objects for insert to anon,authenticated with check(bucket_id='os-fotos' and private.pode_enviar_foto(name));
create policy horaria_fotos_select on storage.objects for select to authenticated using(bucket_id='os-fotos' and private.pode_ler_foto(name));
-- Sem UPDATE/DELETE: objetos e metadados de fotos não podem ser sobrescritos.
create function public.registrar_foto(p_caminho text,p_categoria text,p_descricao text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico; fid uuid; begin
 select * into o from public.ordens_servico where id::text=split_part(p_caminho,'/',2);
 if o.id is null or not private.pode_enviar_foto(p_caminho) then raise exception 'Upload não autorizado';end if;
 if not exists(select 1 from storage.objects where bucket_id='os-fotos' and name=p_caminho) then raise exception 'Envie a imagem antes de registrá-la';end if;
 if length(coalesce(p_descricao,''))>1000 then raise exception 'Observação muito longa';end if;
 insert into public.fotos_os(empresa_id,ordem_id,caminho,url,categoria,descricao,usuario_id,autor) values(o.empresa_id,o.id,p_caminho,'storage://os-fotos/'||p_caminho,p_categoria,p_descricao,auth.uid(),case when auth.uid() is null then 'Cliente' else 'Equipe técnica' end) returning id into fid;
 insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,usuario_id,autor) values(o.empresa_id,o.id,'Foto adicionada',p_categoria,auth.uid(),case when auth.uid() is null then 'Cliente' else 'Equipe técnica' end);
 return fid;end $$;
create function public.confirmar_entrada(p_ordem uuid) returns void language plpgsql security invoker set search_path='' as $$
declare o public.ordens_servico; obrigatoria boolean;begin
 select * into strict o from public.ordens_servico where id=p_ordem;
 select fotos_obrigatorias into obrigatoria from public.empresas where id=o.empresa_id;
 if obrigatoria and not exists(select 1 from public.fotos_os where ordem_id=p_ordem) then raise exception 'Registre pelo menos uma foto para confirmar a entrada';end if;
 update public.ordens_servico set entrada_confirmada=true,status=case when status='novo' then 'recebido' else status end where id=p_ordem;
end $$;
create function private.validar_fotos_entrada() returns trigger language plpgsql security definer set search_path='' as $$begin
 if (new.entrada_confirmada or new.status not in ('novo','cancelado')) and exists(select 1 from public.empresas where id=new.empresa_id and fotos_obrigatorias) and not exists(select 1 from public.fotos_os where ordem_id=new.id) then raise exception 'Registre pelo menos uma foto do equipamento';end if;return new;end $$;
create trigger exigir_foto before insert or update on public.ordens_servico for each row execute function private.validar_fotos_entrada();
revoke all on function public.registrar_foto(text,text,text),public.confirmar_entrada(uuid),private.validar_fotos_entrada() from public,anon,authenticated;
grant execute on function public.registrar_foto(text,text,text) to anon,authenticated;
grant execute on function public.confirmar_entrada(uuid) to authenticated;
commit;
