begin;
create function public.configurar_empresa(p_nome text,p_slug text,p_horario jsonb,p_endereco boolean,p_servicos jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare empresa uuid; item jsonb;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta'; end if;
 if jsonb_typeof(p_servicos)<>'array' or jsonb_array_length(p_servicos)<1 or jsonb_array_length(p_servicos)>50 then raise exception 'Cadastre entre 1 e 50 serviços'; end if;
 insert into public.empresas(dono_id,nome,slug,horario,solicitar_endereco) values(auth.uid(),p_nome,p_slug,p_horario,p_endereco) returning id into empresa;
 for item in select * from jsonb_array_elements(p_servicos) loop
  insert into public.servicos(empresa_id,nome,duracao) values(empresa,item->>'nome',(item->>'duracao')::integer);
 end loop;
 return empresa;
end $$;
revoke all on function public.configurar_empresa(text,text,jsonb,boolean,jsonb) from public;
grant execute on function public.configurar_empresa(text,text,jsonb,boolean,jsonb) to authenticated;
commit;
