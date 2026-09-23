revoke execute on function public.responder_orcamento(uuid,text,text,text,text)
  from authenticated;

grant execute on function public.responder_orcamento(uuid,text,text,text,text)
  to service_role;
