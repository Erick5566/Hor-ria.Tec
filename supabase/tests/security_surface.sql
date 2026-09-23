-- Security surface checks for the Horária exposed API.
-- Run after migrations. This file is read-only.

do $$
declare
  fn text;
  internal_functions text[] := array[
    'public.agenda_period(date,date)',
    'public.applied_parts_options(uuid)',
    'public.appointment_form_options()',
    'public.catalog_page(boolean,integer,integer,text)',
    'public.dashboard_overview(date,date)',
    'public.finance_overview_page(integer,integer,uuid)',
    'public.inventory_page(integer,integer,text,text,text)',
    'public.order_detail_summary(uuid)',
    'public.orders_list_page(integer,integer,text,text,text,text,integer,text)',
    'public.records_list_page(text,integer,integer,text)',
    'public.repair_bench_data()',
    'public.reports_month_overview(text)'
  ];
begin
  foreach fn in array internal_functions loop
    if has_function_privilege('anon', fn, 'EXECUTE') then
      raise exception 'FAIL: anon can execute %', fn;
    end if;

    if not has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'FAIL: authenticated cannot execute %', fn;
    end if;
  end loop;

  if has_function_privilege(
    'anon',
    'public.solicitar_reparo(text,jsonb,jsonb,text,uuid,timestamptz,text)',
    'EXECUTE'
  ) then
    raise exception 'FAIL: anon can bypass the public booking Edge Function';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.solicitar_reparo(text,jsonb,jsonb,text,uuid,timestamptz,text)',
    'EXECUTE'
  ) then
    raise exception 'FAIL: public booking Edge Function cannot execute its RPC';
  end if;

end $$;

select 'PASS: internal RPC grants are isolated from anon' as resultado;
