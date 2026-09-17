begin;
create index pecas_aplicadas_usuario_idx on public.pecas_aplicadas(usuario_id);
commit;
