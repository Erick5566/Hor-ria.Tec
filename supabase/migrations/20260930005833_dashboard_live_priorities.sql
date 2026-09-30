-- Enrich existing dashboard lists without changing its tenant, role or period guards.
-- Agenda inherits the linked order's priority; unlinked bookings are medium.
do $migration$
declare
  v_def text;
  v_start integer;
  v_end integer;
  v_lists text := $lists$
'latestOrders', (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id, 'numero', x.numero, 'status', x.status,
    'criado_em', x.criado_em, 'prioridade', x.prioridade,
    'prazo_previsto', x.prazo_previsto,
    'cliente_nome', x.cliente_nome, 'equipamento_modelo', x.equipamento_modelo
  ) order by x.priority_rank, x.sort_time, x.criado_em, x.id), '[]'::jsonb)
  from (
    select po.id, po.numero, po.status, po.criado_em, po.prioridade, po.prazo_previsto,
      coalesce(c.nome, 'Cliente') as cliente_nome,
      coalesce(e.modelo, 'Equipamento') as equipamento_modelo,
      case po.prioridade when 'urgente' then 0 when 'alta' then 1 when 'normal' then 2 else 3 end as priority_rank,
      coalesce(po.prazo_previsto::timestamp at time zone 'America/Sao_Paulo', po.criado_em) as sort_time
    from period_orders po
    left join public.clientes c on c.id = po.cliente_id and c.empresa_id = v_empresa
    left join public.equipamentos e on e.id = po.equipamento_id and e.empresa_id = v_empresa
    order by priority_rank, sort_time, po.criado_em, po.id
    limit 6
  ) x
),
'todayAgenda', (
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'inicio', a.inicio, 'status', a.status,
    'nome_cliente', a.nome_cliente, 'descricao', a.descricao,
    'prioridade', a.prioridade
  ) order by a.priority_rank, a.inicio, a.id), '[]'::jsonb)
  from (
    select b.id, b.inicio, b.status, b.nome_cliente, b.descricao,
      coalesce(o.prioridade, 'normal') as prioridade,
      case coalesce(o.prioridade, 'normal') when 'urgente' then 0 when 'alta' then 1 when 'normal' then 2 else 3 end as priority_rank
    from public.agendamentos b
    left join public.ordens_servico o on o.id = b.ordem_id and o.empresa_id = v_empresa
    where b.empresa_id = v_empresa and not b.bloqueio
      and (b.inicio at time zone 'America/Sao_Paulo')::date = v_today
    order by priority_rank, b.inicio, b.id
    limit 6
  ) a
),
$lists$;
begin
  v_def := pg_get_functiondef('public.dashboard_overview(date,date)'::regprocedure);
  v_start := strpos(v_def, '''latestOrders'', (');
  v_end := strpos(v_def, '''priorities'', (');
  if v_start = 0 or v_end <= v_start then
    raise exception 'Unexpected dashboard_overview shape: list markers missing';
  end if;
  v_def := substr(v_def, 1, v_start - 1) || v_lists || substr(v_def, v_end);
  execute v_def;
end;
$migration$;
