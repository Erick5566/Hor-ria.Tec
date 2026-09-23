-- Restored verbatim from the existing Supabase migration history.

create index if not exists historico_os_ordem_criado_desc_idx
  on public.historico_os (ordem_id, criado_em desc);

create index if not exists fotos_os_ordem_criado_desc_idx
  on public.fotos_os (ordem_id, criado_em desc);

create or replace function public.agenda_period(
  p_start date,
  p_end_exclusive date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_empresa uuid;
  v_start timestamptz;
  v_end timestamptz;
begin
  select m.empresa_id
    into v_empresa
  from public.empresa_membros m
  where m.usuario_id = auth.uid()
    and m.status = 'ACTIVE'
    and private.company_operational(m.empresa_id)
  order by case m.role
    when 'OWNER' then 1
    when 'ADMIN' then 2
    when 'TECHNICIAN' then 3
    else 4
  end
  limit 1;

  if v_empresa is null then
    return null;
  end if;

  v_start := p_start::timestamp at time zone 'America/Sao_Paulo';
  v_end := greatest(p_end_exclusive, p_start + 1)::timestamp
    at time zone 'America/Sao_Paulo';

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'empresa_id', a.empresa_id,
        'servico_id', a.servico_id,
        'servico_nome', s.nome,
        'nome_cliente', a.nome_cliente,
        'telefone', a.telefone,
        'endereco', a.endereco,
        'descricao', a.descricao,
        'inicio', a.inicio,
        'fim', a.fim,
        'status', a.status,
        'bloqueio', a.bloqueio,
        'ordem_id', a.ordem_id,
        'finalidade', a.finalidade
      )
      order by a.inicio
    )
    from public.agendamentos a
    left join public.servicos s
      on s.id = a.servico_id and s.empresa_id = v_empresa
    where a.empresa_id = v_empresa
      and a.inicio >= v_start
      and a.inicio < v_end
  ), '[]'::jsonb);
end;
$body$;

create or replace function public.appointment_form_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_empresa uuid;
begin
  select m.empresa_id
    into v_empresa
  from public.empresa_membros m
  where m.usuario_id = auth.uid()
    and m.status = 'ACTIVE'
    and private.company_operational(m.empresa_id)
  order by case m.role
    when 'OWNER' then 1
    when 'ADMIN' then 2
    when 'TECHNICIAN' then 3
    else 4
  end
  limit 1;

  if v_empresa is null then
    return null;
  end if;

  return jsonb_build_object(
    'orders', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', o.id,
          'numero', o.numero,
          'cliente_id', o.cliente_id,
          'cliente_nome', coalesce(c.nome, 'Cliente'),
          'cliente_whatsapp', coalesce(c.whatsapp, '')
        )
        order by o.numero desc
      )
      from public.ordens_servico o
      left join public.clientes c
        on c.id = o.cliente_id and c.empresa_id = v_empresa
      where o.empresa_id = v_empresa
        and o.status not in ('finalizado', 'cancelado')
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'nome', s.nome,
          'duracao', s.duracao
        )
        order by s.nome
      )
      from public.servicos s
      where s.empresa_id = v_empresa
        and s.ativo
    ), '[]'::jsonb)
  );
end;
$body$;

create or replace function public.order_detail_summary(
  p_order uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $body$
declare
  v_empresa uuid;
begin
  select m.empresa_id
    into v_empresa
  from public.empresa_membros m
  where m.usuario_id = auth.uid()
    and m.status = 'ACTIVE'
    and private.company_operational(m.empresa_id)
  order by case m.role
    when 'OWNER' then 1
    when 'ADMIN' then 2
    when 'TECHNICIAN' then 3
    else 4
  end
  limit 1;

  if v_empresa is null then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'order', to_jsonb(o),
      'client', jsonb_build_object(
        'id', c.id,
        'nome', c.nome,
        'whatsapp', c.whatsapp
      ),
      'equipment', jsonb_build_object(
        'id', e.id,
        'marca', e.marca,
        'modelo', e.modelo,
        'imei', e.imei
      )
    )
    from public.ordens_servico o
    join public.clientes c
      on c.id = o.cliente_id and c.empresa_id = v_empresa
    join public.equipamentos e
      on e.id = o.equipamento_id and e.empresa_id = v_empresa
    where o.id = p_order
      and o.empresa_id = v_empresa
    limit 1
  );
end;
$body$;

revoke all on function public.agenda_period(date,date) from public;
grant execute on function public.agenda_period(date,date) to authenticated;

revoke all on function public.appointment_form_options() from public;
grant execute on function public.appointment_form_options() to authenticated;

revoke all on function public.order_detail_summary(uuid) from public;
grant execute on function public.order_detail_summary(uuid) to authenticated;


