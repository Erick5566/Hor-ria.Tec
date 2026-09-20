-- Horária pre-launch security hardening.
-- Internal tenant RPCs are authenticated-only; public booking receives stricter
-- validation and a coarse anti-flood guard.

revoke execute on function public.agenda_period(date, date) from public, anon;
grant execute on function public.agenda_period(date, date) to authenticated;

revoke execute on function public.applied_parts_options(uuid) from public, anon;
grant execute on function public.applied_parts_options(uuid) to authenticated;

revoke execute on function public.appointment_form_options() from public, anon;
grant execute on function public.appointment_form_options() to authenticated;

revoke execute on function public.catalog_page(boolean, integer, integer, text) from public, anon;
grant execute on function public.catalog_page(boolean, integer, integer, text) to authenticated;

revoke execute on function public.dashboard_overview(date, date) from public, anon;
grant execute on function public.dashboard_overview(date, date) to authenticated;

revoke execute on function public.finance_overview_page(integer, integer, uuid) from public, anon;
grant execute on function public.finance_overview_page(integer, integer, uuid) to authenticated;

revoke execute on function public.inventory_page(integer, integer, text, text, text) from public, anon;
grant execute on function public.inventory_page(integer, integer, text, text, text) to authenticated;

revoke execute on function public.order_detail_summary(uuid) from public, anon;
grant execute on function public.order_detail_summary(uuid) to authenticated;

revoke execute on function public.orders_list_page(integer, integer, text, text, text, text, integer, text) from public, anon;
grant execute on function public.orders_list_page(integer, integer, text, text, text, text, integer, text) to authenticated;

revoke execute on function public.records_list_page(text, integer, integer, text) from public, anon;
grant execute on function public.records_list_page(text, integer, integer, text) to authenticated;

revoke execute on function public.repair_bench_data() from public, anon;
grant execute on function public.repair_bench_data() to authenticated;

revoke execute on function public.reports_month_overview(text) from public, anon;
grant execute on function public.reports_month_overview(text) to authenticated;

create or replace function public.solicitar_reparo(
  p_slug text,
  p_cliente jsonb,
  p_equipamento jsonb,
  p_problema text,
  p_servico uuid default null,
  p_inicio timestamptz default null,
  p_endereco text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  e public.empresas;
  c uuid;
  eq uuid;
  o public.ordens_servico;
  t uuid;
  tel text;
  nome text;
  email text;
  problema text;
  endereco_limpo text;
  categoria_equipamento text;
  tipo_personalizado text;
  marca text;
  modelo text;
  cor text;
begin
  select * into strict e
  from public.empresas
  where slug = p_slug
    and private.public_company_available(id);

  nome := trim(coalesce(p_cliente->>'nome', ''));
  tel := regexp_replace(coalesce(p_cliente->>'whatsapp', ''), '\D', '', 'g');
  email := nullif(lower(trim(coalesce(p_cliente->>'email', ''))), '');
  problema := trim(coalesce(p_problema, ''));
  endereco_limpo := nullif(trim(coalesce(p_endereco, '')), '');

  categoria_equipamento :=
    coalesce(nullif(trim(coalesce(p_equipamento->>'categoria', '')), ''), 'Outro');
  tipo_personalizado := nullif(trim(coalesce(p_equipamento->>'tipo_personalizado', '')), '');
  marca := trim(coalesce(p_equipamento->>'marca', ''));
  modelo := trim(coalesce(p_equipamento->>'modelo', ''));
  cor := trim(coalesce(p_equipamento->>'cor', ''));

  if length(nome) not between 2 and 100 or tel !~ '^[0-9]{10,15}$' then
    raise exception 'Informe nome e WhatsApp válidos';
  end if;

  if email is not null and (
    length(email) > 200
    or email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ) then
    raise exception 'Informe um e-mail válido';
  end if;

  if length(problema) not between 3 and 2000 then
    raise exception 'Descreva o problema em até 2000 caracteres';
  end if;

  if endereco_limpo is not null and length(endereco_limpo) > 300 then
    raise exception 'Endereço muito longo';
  end if;

  if categoria_equipamento = 'Outro'
     and coalesce(length(tipo_personalizado), 0) not between 2 and 120 then
    raise exception 'Informe o tipo do equipamento';
  end if;

  if length(marca) > 100 or length(modelo) > 120 or length(cor) > 100 then
    raise exception 'Dados do equipamento excedem o limite permitido';
  end if;

  if p_inicio is not null then
    if not private.feature_enabled(e.id, 'appointmentsEnabled') then
      raise exception 'A agenda está temporariamente indisponível';
    end if;

    if p_inicio > now() + interval '90 days' then
      raise exception 'Escolha uma data dentro dos próximos 90 dias';
    end if;

    if p_servico is null or not exists (
      select 1
      from public.servicos s
      where s.id = p_servico
        and s.empresa_id = e.id
        and s.ativo
    ) then
      raise exception 'Selecione um serviço válido';
    end if;
  end if;

  if (
    select count(*)
    from public.ordens_servico os
    join public.clientes cl
      on cl.id = os.cliente_id
     and cl.empresa_id = os.empresa_id
    where os.empresa_id = e.id
      and cl.whatsapp = tel
      and os.origem = 'cliente'
      and os.criado_em > now() - interval '1 day'
  ) >= 5 then
    raise exception 'Limite de solicitações atingido. Entre em contato com a assistência';
  end if;

  if (
    select count(*)
    from public.ordens_servico os
    where os.empresa_id = e.id
      and os.origem = 'cliente'
      and os.criado_em > now() - interval '10 minutes'
  ) >= 60 then
    raise exception 'Muitas solicitações em pouco tempo. Tente novamente mais tarde';
  end if;

  insert into public.clientes(empresa_id, nome, whatsapp, email)
  values (e.id, nome, tel, email)
  on conflict(empresa_id, whatsapp) do nothing
  returning id into c;

  if c is null then
    select id into strict c
    from public.clientes
    where empresa_id = e.id and whatsapp = tel;
  end if;

  insert into public.equipamentos(
    empresa_id, cliente_id, categoria, tipo_personalizado,
    marca, modelo, cor, numero_serie, imei, acessorios
  )
  values (
    e.id, c, categoria_equipamento,
    case when categoria_equipamento = 'Outro' then tipo_personalizado else null end,
    marca, modelo, cor, '', '', ''
  )
  returning id into eq;

  insert into public.ordens_servico(
    empresa_id, cliente_id, equipamento_id, problema, origem
  )
  values (e.id, c, eq, problema, 'cliente')
  returning * into o;

  if p_inicio is not null then
    insert into public.agendamentos(
      empresa_id, ordem_id, servico_id, nome_cliente,
      telefone, endereco, inicio, finalidade
    )
    values (
      e.id, o.id, p_servico, nome, tel,
      endereco_limpo, p_inicio, 'Recebimento'
    );
  end if;

  insert into private.upload_tickets(ordem_id)
  values (o.id)
  returning token into t;

  return jsonb_build_object(
    'id', o.id,
    'empresa_id', e.id,
    'numero', o.numero,
    'codigo', o.codigo_publico,
    'token', o.token_acompanhamento,
    'upload_token', t
  );
end
$function$;

revoke execute on function public.solicitar_reparo(text, jsonb, jsonb, text, uuid, timestamptz, text) from public;
grant execute on function public.solicitar_reparo(text, jsonb, jsonb, text, uuid, timestamptz, text) to anon, authenticated;
