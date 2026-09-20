-- Apply after the MFA UI has reached production.
create or replace function private.require_super_admin()
returns void
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  if not private.is_super_admin() then
    raise exception 'Acesso administrativo negado';
  end if;
  if coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' then
    raise exception 'Verificação em duas etapas necessária';
  end if;
end
$function$;

create or replace function private.has_company_role(p_empresa uuid,p_roles text[])
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
  select exists(
    select 1 from public.empresa_membros m
    where m.empresa_id=p_empresa
      and m.usuario_id=auth.uid()
      and m.status='ACTIVE'
      and m.role=any(p_roles)
  )
$function$;

revoke all on function private.has_company_role(uuid,text[]) from public,anon,authenticated;

drop policy if exists tenant_member_select on public.financeiro;
drop policy if exists tenant_member_insert on public.financeiro;
drop policy if exists tenant_member_update on public.financeiro;
create policy financeiro_manager_select on public.financeiro
for select to authenticated
using(private.can_manage_company(empresa_id) and private.feature_enabled(empresa_id,'financialEnabled'));
create policy financeiro_manager_insert on public.financeiro
for insert to authenticated
with check(private.can_manage_company(empresa_id) and private.feature_enabled(empresa_id,'financialEnabled'));
create policy financeiro_manager_update on public.financeiro
for update to authenticated
using(private.can_manage_company(empresa_id) and private.feature_enabled(empresa_id,'financialEnabled'))
with check(private.can_manage_company(empresa_id) and private.feature_enabled(empresa_id,'financialEnabled'));

drop policy if exists assinatura_membro_select on public.assinaturas;
create policy assinatura_gestor_select on public.assinaturas
for select to authenticated using(private.can_manage_company(empresa_id));

drop policy if exists servicos_member_insert on public.servicos;
drop policy if exists servicos_member_update on public.servicos;
drop policy if exists servicos_member_delete on public.servicos;
create policy servicos_manager_insert on public.servicos
for insert to authenticated with check(private.can_manage_company(empresa_id));
create policy servicos_manager_update on public.servicos
for update to authenticated
using(private.can_manage_company(empresa_id))
with check(private.can_manage_company(empresa_id));
create policy servicos_manager_delete on public.servicos
for delete to authenticated using(private.can_manage_company(empresa_id));

drop policy if exists tenant_member_insert on public.pecas;
drop policy if exists tenant_member_update on public.pecas;
create policy pecas_operational_insert on public.pecas
for insert to authenticated
with check(
  private.has_company_role(empresa_id,array['OWNER','ADMIN','TECHNICIAN'])
  and private.feature_enabled(empresa_id,'stockEnabled')
);
create policy pecas_operational_update on public.pecas
for update to authenticated
using(
  private.has_company_role(empresa_id,array['OWNER','ADMIN','TECHNICIAN'])
  and private.feature_enabled(empresa_id,'stockEnabled')
)
with check(
  private.has_company_role(empresa_id,array['OWNER','ADMIN','TECHNICIAN'])
  and private.feature_enabled(empresa_id,'stockEnabled')
);


-- Mask financial data in SECURITY DEFINER read RPCs for non-managers.
do $$
declare
  def text;
  signature regprocedure;
begin
  foreach signature in array array[
    'public.dashboard_overview(date,date)'::regprocedure,
    'public.finance_overview_page(integer,integer,uuid)'::regprocedure,
    'public.reports_month_overview(text)'::regprocedure
  ]
  loop
    select pg_get_functiondef(signature) into def;

    if position('private.can_manage_company(v_empresa)' in def)=0 then
      def := replace(
        def,
        'where f.empresa_id = v_empresa',
        'where f.empresa_id = v_empresa
            and private.can_manage_company(v_empresa)'
      );
      execute def;
    end if;
  end loop;
end
$$;
