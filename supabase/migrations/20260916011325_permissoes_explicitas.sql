begin;
-- Supabase pode conceder EXECUTE diretamente aos papéis via privilégios padrão.
-- Revogar apenas de PUBLIC não remove essas concessões diretas.
revoke all on function public.validar_agendamento(),public.validar_expediente(),public.configurar_empresa(text,text,jsonb,boolean,jsonb),public.catalogo(text),public.horarios_disponiveis(text,uuid,date) from public,anon,authenticated;
grant execute on function public.configurar_empresa(text,text,jsonb,boolean,jsonb) to authenticated;
grant execute on function public.catalogo(text),public.horarios_disponiveis(text,uuid,date) to anon,authenticated;
create schema if not exists extensions;
alter extension btree_gist set schema extensions;
commit;
