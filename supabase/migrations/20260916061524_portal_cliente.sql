begin;
create function public.perfil_assistencia(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select public.catalogo(p_slug)||jsonb_build_object('telefone',telefone,'endereco',endereco,'descricao',descricao_publica,'fotos_obrigatorias',fotos_obrigatorias) from public.empresas where slug=p_slug
$$;
create function public.solicitar_reparo(p_slug text,p_cliente jsonb,p_equipamento jsonb,p_problema text,p_servico uuid default null,p_inicio timestamptz default null,p_endereco text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.empresas;c uuid;eq uuid;o public.ordens_servico;t uuid;tel text;begin
 select * into strict e from public.empresas where slug=p_slug;
 tel:=regexp_replace(p_cliente->>'whatsapp','\D','','g');
 if tel is null or tel !~ '^[0-9]{10,15}$' or length(trim(coalesce(p_cliente->>'nome',''))) not between 2 and 100 then raise exception 'Informe nome e WhatsApp válidos';end if;
 if (select count(*) from public.ordens_servico os join public.clientes cl on cl.id=os.cliente_id where os.empresa_id=e.id and cl.whatsapp=tel and os.origem='cliente' and os.criado_em>now()-interval '1 day')>=5 then raise exception 'Limite de solicitações atingido. Entre em contato com a assistência';end if;
 insert into public.clientes(empresa_id,nome,whatsapp,email) values(e.id,trim(p_cliente->>'nome'),tel,nullif(left(p_cliente->>'email',200),'')) on conflict(empresa_id,whatsapp) do nothing returning id into c;
 if c is null then select id into strict c from public.clientes where empresa_id=e.id and whatsapp=tel;end if;
 insert into public.equipamentos(empresa_id,cliente_id,categoria,marca,modelo,cor,numero_serie,imei,acessorios) values(e.id,c,p_equipamento->>'categoria',coalesce(left(p_equipamento->>'marca',100),''),coalesce(left(p_equipamento->>'modelo',100),''),coalesce(left(p_equipamento->>'cor',100),''),'','','') returning id into eq;
 insert into public.ordens_servico(empresa_id,cliente_id,equipamento_id,problema,origem) values(e.id,c,eq,p_problema,'cliente') returning * into o;
 if p_inicio is not null then
  if p_servico is null then raise exception 'Selecione um serviço';end if;
  insert into public.agendamentos(empresa_id,ordem_id,servico_id,nome_cliente,telefone,endereco,inicio,finalidade) values(e.id,o.id,p_servico,trim(p_cliente->>'nome'),tel,p_endereco,p_inicio,'Recebimento');
 end if;
 insert into private.upload_tickets(ordem_id) values(o.id) returning token into t;
 return jsonb_build_object('id',o.id,'empresa_id',e.id,'numero',o.numero,'codigo',o.codigo_publico,'upload_token',t);
end $$;
create function public.consultar_reparo(p_codigo text,p_telefone text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('numero',o.numero,'status',o.status,'previsao',o.previsao,'empresa',e.nome,'equipamento',jsonb_build_object('categoria',eq.categoria,'marca',eq.marca,'modelo',eq.modelo),'orcamento',(select jsonb_build_object('id',q.id,'versao',q.versao,'servicos',q.servicos,'pecas',q.pecas,'mao_obra',q.mao_obra,'desconto',q.desconto,'total',q.total,'validade',q.validade,'status',q.status) from public.orcamentos q where q.ordem_id=o.id and q.status<>'rascunho' order by q.versao desc limit 1),'historico',coalesce((select jsonb_agg(jsonb_build_object('evento',h.evento,'data',h.criado_em) order by h.criado_em) from public.historico_os h where h.ordem_id=o.id and h.publico),'[]'::jsonb))
 from public.ordens_servico o join public.clientes c on c.id=o.cliente_id join public.equipamentos eq on eq.id=o.equipamento_id join public.empresas e on e.id=o.empresa_id
 where length(p_codigo)=16 and o.codigo_publico=upper(p_codigo) and c.whatsapp=regexp_replace(p_telefone,'\D','','g')
$$;
revoke all on function public.perfil_assistencia(text),public.solicitar_reparo(text,jsonb,jsonb,text,uuid,timestamptz,text),public.consultar_reparo(text,text) from public,anon,authenticated;
grant execute on function public.perfil_assistencia(text),public.solicitar_reparo(text,jsonb,jsonb,text,uuid,timestamptz,text),public.consultar_reparo(text,text) to anon,authenticated;
commit;
