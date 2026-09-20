-- Notification read state and realtime feeds used by the Horária workspace.
create table if not exists public.notification_reads (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  notification_id text not null,
  read_at timestamptz not null default now(),
  primary key (empresa_id, usuario_id, notification_id)
);

alter table public.notification_reads enable row level security;

drop policy if exists notification_reads_select on public.notification_reads;
create policy notification_reads_select
on public.notification_reads
for select
using (usuario_id = auth.uid() and private.can_access_company(empresa_id));

drop policy if exists notification_reads_insert on public.notification_reads;
create policy notification_reads_insert
on public.notification_reads
for insert
with check (usuario_id = auth.uid() and private.can_access_company(empresa_id));

drop policy if exists notification_reads_update on public.notification_reads;
create policy notification_reads_update
on public.notification_reads
for update
using (usuario_id = auth.uid() and private.can_access_company(empresa_id))
with check (usuario_id = auth.uid() and private.can_access_company(empresa_id));

drop policy if exists notification_reads_delete on public.notification_reads;
create policy notification_reads_delete
on public.notification_reads
for delete
using (usuario_id = auth.uid() and private.can_access_company(empresa_id));

create index if not exists notification_reads_user_company_idx
  on public.notification_reads(usuario_id, empresa_id, read_at desc);

do $$
declare
  t text;
begin
  foreach t in array array[
    'ordens_servico',
    'orcamentos',
    'agendamentos',
    'notification_reads',
    'clientes',
    'equipamentos',
    'financeiro',
    'pecas',
    'servicos'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        t
      );
    end if;
  end loop;
end $$;
