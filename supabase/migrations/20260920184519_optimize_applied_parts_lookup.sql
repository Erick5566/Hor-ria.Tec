-- Restored verbatim from the existing Supabase migration history.

create or replace function public.applied_parts_options(p_order uuid)
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

  if not exists (
    select 1
    from public.ordens_servico o
    where o.id = p_order and o.empresa_id = v_empresa
  ) then
    raise exception 'Ordem inválida';
  end if;

  return jsonb_build_object(
    'applied', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.criado_em desc)
      from public.pecas_aplicadas a
      where a.empresa_id = v_empresa
        and a.ordem_id = p_order
    ), '[]'::jsonb),
    'stock', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'nome', p.nome,
          'quantidade', p.quantidade,
          'custo', p.custo,
          'preco', p.preco
        )
        order by p.nome
      )
      from public.pecas p
      where p.empresa_id = v_empresa
        and p.ativo
        and p.quantidade > 0
    ), '[]'::jsonb)
  );
end;
$body$;

revoke all on function public.applied_parts_options(uuid) from public;
grant execute on function public.applied_parts_options(uuid) to authenticated;


