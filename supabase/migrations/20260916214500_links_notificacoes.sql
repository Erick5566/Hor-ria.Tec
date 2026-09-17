begin;

create or replace function public.solicitar_reparo(p_slug text,p_cliente jsonb,p_equipamento jsonb,p_problema text,p_servico uuid default null,p_inicio timestamptz default null,p_endereco text default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
 return jsonb_build_object('id',o.id,'empresa_id',e.id,'numero',o.numero,'codigo',o.codigo_publico,'token',o.token_acompanhamento,'upload_token',t);
end $$;

create or replace function private.enfileirar_notificacao_ordem() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.clientes;eq public.equipamentos;begin
 if new.status='pronto_retirada' and old.status is distinct from new.status then
  select * into strict c from public.clientes where id=new.cliente_id and empresa_id=new.empresa_id;
  select * into strict eq from public.equipamentos where id=new.equipamento_id and empresa_id=new.empresa_id;
  insert into public.notificacoes(empresa_id,ordem_id,evento,chave_idempotencia,destinatario,mensagem,payload)
  values(new.empresa_id,new.id,'pronto_retirada','ordem:'||new.id||':pronto_retirada',c.whatsapp,'Olá, '||c.nome||'. Seu '||trim(concat_ws(' ',nullif(eq.marca,''),eq.modelo))||' já está pronto para retirada.',jsonb_build_object('token',new.token_acompanhamento,'numero',new.numero,'cliente',c.nome,'equipamento',trim(concat_ws(' ',nullif(eq.marca,''),eq.modelo)))) on conflict(chave_idempotencia) do nothing;
 end if;return new;
end $$;

create or replace function private.enfileirar_notificacao_orcamento() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico;c public.clientes;eq public.equipamentos;begin
 if new.status='enviado' and (TG_OP='INSERT' or old.status is distinct from new.status) then
  select * into strict o from public.ordens_servico where id=new.ordem_id;
  select * into strict c from public.clientes where id=o.cliente_id and empresa_id=o.empresa_id;
  select * into strict eq from public.equipamentos where id=o.equipamento_id and empresa_id=o.empresa_id;
  insert into public.notificacoes(empresa_id,ordem_id,orcamento_id,evento,chave_idempotencia,destinatario,mensagem,payload)
  values(new.empresa_id,new.ordem_id,new.id,'orcamento_enviado','orcamento:'||new.id||':enviado',c.whatsapp,'Olá, '||c.nome||'. O orçamento da sua OS #'||o.numero||' está disponível para análise.',jsonb_build_object('token',o.token_acompanhamento,'numero',o.numero,'total',new.total,'cliente',c.nome,'equipamento',trim(concat_ws(' ',nullif(eq.marca,''),eq.modelo)))) on conflict(chave_idempotencia) do nothing;
 end if;return new;
end $$;

revoke all on function public.solicitar_reparo(text,jsonb,jsonb,text,uuid,timestamptz,text),private.enfileirar_notificacao_ordem(),private.enfileirar_notificacao_orcamento() from public,anon,authenticated;
grant execute on function public.solicitar_reparo(text,jsonb,jsonb,text,uuid,timestamptz,text) to anon,authenticated;

commit;
