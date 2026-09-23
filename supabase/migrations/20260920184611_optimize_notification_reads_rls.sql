-- Restored verbatim from the existing Supabase migration history.

drop policy if exists notification_reads_select on public.notification_reads;
create policy notification_reads_select
on public.notification_reads
for select
to authenticated
using (
  usuario_id = (select auth.uid())
  and private.can_access_company(empresa_id)
);

drop policy if exists notification_reads_insert on public.notification_reads;
create policy notification_reads_insert
on public.notification_reads
for insert
to authenticated
with check (
  usuario_id = (select auth.uid())
  and private.can_access_company(empresa_id)
);

drop policy if exists notification_reads_update on public.notification_reads;
create policy notification_reads_update
on public.notification_reads
for update
to authenticated
using (
  usuario_id = (select auth.uid())
  and private.can_access_company(empresa_id)
)
with check (
  usuario_id = (select auth.uid())
  and private.can_access_company(empresa_id)
);

drop policy if exists notification_reads_delete on public.notification_reads;
create policy notification_reads_delete
on public.notification_reads
for delete
to authenticated
using (
  usuario_id = (select auth.uid())
  and private.can_access_company(empresa_id)
);


