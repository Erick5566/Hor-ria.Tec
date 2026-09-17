-- Catálogo dependente por categoria e suporte a equipamentos fora da lista.
begin;

alter table public.equipamentos
  add column tipo_personalizado text;

alter table public.equipamentos
  drop constraint if exists equipamentos_categoria_check;

alter table public.equipamentos
  add constraint equipamentos_categoria_check check (
    categoria in ('Celular','Notebook','Computador','Tablet','Console','TV','Monitor','Impressora','Smartwatch','Acessório','Fone de ouvido','Eletrônico','Outro')
  );

alter table public.equipamentos
  add constraint equipamentos_tipo_personalizado_check check (
    (categoria = 'Outro' and length(trim(coalesce(tipo_personalizado, ''))) between 2 and 120)
    or (categoria <> 'Outro' and tipo_personalizado is null)
  ) not valid;

create or replace function public.criar_ordem(p_empresa uuid,p_cliente jsonb,p_equipamento jsonb,p_ordem jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare c uuid; e uuid; o uuid; categoria_equipamento text; begin
 if not exists(select 1 from public.empresas where id=p_empresa and dono_id=auth.uid()) then raise exception 'Empresa não autorizada';end if;
 categoria_equipamento:=coalesce(nullif(trim(p_equipamento->>'categoria'),''),'Outro');
 if categoria_equipamento='Outro' and length(trim(coalesce(p_equipamento->>'tipo_personalizado',''))) not between 2 and 120 then raise exception 'Informe o tipo do equipamento';end if;
 if nullif(p_cliente->>'id','') is not null then c:=(p_cliente->>'id')::uuid;
 else insert into public.clientes(empresa_id,nome,whatsapp,email,documento) values(p_empresa,p_cliente->>'nome',regexp_replace(p_cliente->>'whatsapp','\D','','g'),nullif(p_cliente->>'email',''),nullif(p_cliente->>'documento','')) returning id into c;end if;
 if nullif(p_equipamento->>'id','') is not null then e:=(p_equipamento->>'id')::uuid;
 else insert into public.equipamentos(empresa_id,cliente_id,categoria,tipo_personalizado,marca,modelo,cor,numero_serie,imei,acessorios) values(p_empresa,c,categoria_equipamento,case when categoria_equipamento='Outro' then trim(p_equipamento->>'tipo_personalizado') else null end,coalesce(p_equipamento->>'marca',''),p_equipamento->>'modelo',p_equipamento->>'cor',p_equipamento->>'numero_serie',p_equipamento->>'imei',p_equipamento->>'acessorios') returning id into e;end if;
 insert into public.ordens_servico(empresa_id,cliente_id,equipamento_id,problema,estado,observacoes_estado,tecnico,previsao) values(p_empresa,c,e,p_ordem->>'problema',coalesce(array(select jsonb_array_elements_text(p_ordem->'estado')),'{}'),p_ordem->>'observacoes_estado',coalesce(p_ordem->>'tecnico',''),nullif(p_ordem->>'previsao','')::date) returning id into o;
 if length(coalesce(p_equipamento->>'senha',''))>0 then insert into public.equipamento_segredos(ordem_id,empresa_id,senha) values(o,p_empresa,p_equipamento->>'senha');end if;
 return o;
end $$;

create or replace function public.solicitar_reparo(p_slug text,p_cliente jsonb,p_equipamento jsonb,p_problema text,p_servico uuid default null,p_inicio timestamptz default null,p_endereco text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.empresas;c uuid;eq uuid;o public.ordens_servico;t uuid;tel text;categoria_equipamento text;begin
 select * into strict e from public.empresas where slug=p_slug;
 tel:=regexp_replace(p_cliente->>'whatsapp','\D','','g');
 categoria_equipamento:=coalesce(nullif(trim(p_equipamento->>'categoria'),''),'Outro');
 if tel is null or tel !~ '^[0-9]{10,15}$' or length(trim(coalesce(p_cliente->>'nome',''))) not between 2 and 100 then raise exception 'Informe nome e WhatsApp válidos';end if;
 if categoria_equipamento='Outro' and length(trim(coalesce(p_equipamento->>'tipo_personalizado',''))) not between 2 and 120 then raise exception 'Informe o tipo do equipamento';end if;
 if (select count(*) from public.ordens_servico os join public.clientes cl on cl.id=os.cliente_id where os.empresa_id=e.id and cl.whatsapp=tel and os.origem='cliente' and os.criado_em>now()-interval '1 day')>=5 then raise exception 'Limite de solicitações atingido. Entre em contato com a assistência';end if;
 insert into public.clientes(empresa_id,nome,whatsapp,email) values(e.id,trim(p_cliente->>'nome'),tel,nullif(left(p_cliente->>'email',200),'')) on conflict(empresa_id,whatsapp) do nothing returning id into c;
 if c is null then select id into strict c from public.clientes where empresa_id=e.id and whatsapp=tel;end if;
 insert into public.equipamentos(empresa_id,cliente_id,categoria,tipo_personalizado,marca,modelo,cor,numero_serie,imei,acessorios) values(e.id,c,categoria_equipamento,case when categoria_equipamento='Outro' then trim(p_equipamento->>'tipo_personalizado') else null end,coalesce(left(p_equipamento->>'marca',100),''),coalesce(left(p_equipamento->>'modelo',100),''),coalesce(left(p_equipamento->>'cor',100),''),'','','') returning id into eq;
 insert into public.ordens_servico(empresa_id,cliente_id,equipamento_id,problema,origem) values(e.id,c,eq,p_problema,'cliente') returning * into o;
 if p_inicio is not null then
  if p_servico is null then raise exception 'Selecione um serviço';end if;
  insert into public.agendamentos(empresa_id,ordem_id,servico_id,nome_cliente,telefone,endereco,inicio,finalidade) values(e.id,o.id,p_servico,trim(p_cliente->>'nome'),tel,p_endereco,p_inicio,'Recebimento');
 end if;
 insert into private.upload_tickets(ordem_id) values(o.id) returning token into t;
 return jsonb_build_object('id',o.id,'empresa_id',e.id,'numero',o.numero,'codigo',o.codigo_publico,'token',o.token_acompanhamento,'upload_token',t);
end $$;

revoke all on function public.criar_ordem(uuid,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.criar_ordem(uuid,jsonb,jsonb,jsonb) to authenticated;
revoke all on function public.solicitar_reparo(text,jsonb,jsonb,text,uuid,timestamptz,text) from public,anon,authenticated;
grant execute on function public.solicitar_reparo(text,jsonb,jsonb,text,uuid,timestamptz,text) to anon,authenticated;

commit;
