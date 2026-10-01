begin;

drop policy if exists fiscal_settings_member_select on public.fiscal_settings;
create policy fiscal_settings_manager_select
on public.fiscal_settings
for select
to authenticated
using (private.can_manage_company(empresa_id));

drop policy if exists fiscal_documents_member_select on public.fiscal_documents;
create policy fiscal_documents_manager_select
on public.fiscal_documents
for select
to authenticated
using (private.can_manage_company(empresa_id));

commit;