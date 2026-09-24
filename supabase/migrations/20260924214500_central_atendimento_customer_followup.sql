-- Central de Atendimento: acrescenta dados mínimos para follow-up do cliente.

create or replace function public.repair_bench_data()
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
    with active as materialized (
      select
        o.id,
        o.numero,
        o.problema,
        o.status,
        o.prioridade,
        o.tecnico,
        o.mesa_id,
        o.prazo_previsto,
        o.atualizado_em,
        c.nome as cliente_nome,
        c.whatsapp as cliente_whatsapp,
        e.marca as equipamento_marca,
        e.modelo as equipamento_modelo,
        q.status as orcamento_status,
        q.total as orcamento_total,
        q.criado_em as orcamento_criado_em,
        q.respondido_em as orcamento_respondido_em
      from public.ordens_servico o
      left join public.clientes c
        on c.id = o.cliente_id and c.empresa_id = v_empresa
      left join public.equipamentos e
        on e.id = o.equipamento_id and e.empresa_id = v_empresa
      left join lateral (
        select
          oq.status,
          oq.total,
          oq.criado_em,
          oq.respondido_em
        from public.orcamentos oq
        where oq.empresa_id = v_empresa
          and oq.ordem_id = o.id
        order by oq.versao desc
        limit 1
      ) q on true
      where o.empresa_id = v_empresa
        and o.status not in ('finalizado', 'cancelado')
    )
    select jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(to_jsonb(a) order by a.numero desc)
        from active a
      ), '[]'::jsonb),
      'technicians', coalesce((
        select jsonb_agg(t.tecnico order by t.tecnico)
        from (
          select distinct trim(tecnico) as tecnico
          from active
          where nullif(trim(tecnico), '') is not null
        ) t
      ), '[]'::jsonb)
    )
  );
end;
$body$;

revoke all on function public.repair_bench_data() from public;
grant execute on function public.repair_bench_data() to authenticated;
