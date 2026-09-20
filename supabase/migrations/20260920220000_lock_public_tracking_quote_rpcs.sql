-- Run only after the public-tracking frontend is deployed successfully.
revoke execute on function public.acompanhar_por_token(uuid)
  from public, anon, authenticated;
grant execute on function public.acompanhar_por_token(uuid) to service_role;

revoke execute on function public.consultar_reparo(text,text)
  from public, anon, authenticated;
grant execute on function public.consultar_reparo(text,text) to service_role;

revoke execute on function public.responder_orcamento_link(uuid,text,text,uuid)
  from public, anon, authenticated;
grant execute on function public.responder_orcamento_link(uuid,text,text,uuid)
  to service_role;

revoke execute on function public.responder_orcamento(uuid,text,text,text,text)
  from public, anon;
grant execute on function public.responder_orcamento(uuid,text,text,text,text)
  to authenticated, service_role;
