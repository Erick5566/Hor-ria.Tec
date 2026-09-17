-- Abertura atômica de cliente, equipamento e ordem de serviço.
begin;
create function public.criar_ordem(p_empresa uuid,p_cliente jsonb,p_equipamento jsonb,p_ordem jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare c uuid; e uuid; o uuid; begin
 if not exists(select 1 from public.empresas where id=p_empresa and dono_id=auth.uid()) then raise exception 'Empresa não autorizada';end if;
 if nullif(p_cliente->>'id','') is not null then c:=(p_cliente->>'id')::uuid;
 else insert into public.clientes(empresa_id,nome,whatsapp,email,documento) values(p_empresa,p_cliente->>'nome',regexp_replace(p_cliente->>'whatsapp','\D','','g'),nullif(p_cliente->>'email',''),nullif(p_cliente->>'documento','')) returning id into c;end if;
 if nullif(p_equipamento->>'id','') is not null then e:=(p_equipamento->>'id')::uuid;
 else insert into public.equipamentos(empresa_id,cliente_id,categoria,marca,modelo,cor,numero_serie,imei,acessorios) values(p_empresa,c,p_equipamento->>'categoria',coalesce(p_equipamento->>'marca',''),p_equipamento->>'modelo',p_equipamento->>'cor',p_equipamento->>'numero_serie',p_equipamento->>'imei',p_equipamento->>'acessorios') returning id into e;end if;
 insert into public.ordens_servico(empresa_id,cliente_id,equipamento_id,problema,estado,observacoes_estado,tecnico,previsao) values(p_empresa,c,e,p_ordem->>'problema',coalesce(array(select jsonb_array_elements_text(p_ordem->'estado')),'{}'),p_ordem->>'observacoes_estado',coalesce(p_ordem->>'tecnico',''),nullif(p_ordem->>'previsao','')::date) returning id into o;
 if length(coalesce(p_equipamento->>'senha',''))>0 then insert into public.equipamento_segredos(ordem_id,empresa_id,senha) values(o,p_empresa,p_equipamento->>'senha');end if;
 return o;
end $$;
revoke all on function public.criar_ordem(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.criar_ordem(uuid,jsonb,jsonb,jsonb) to authenticated;
commit;
