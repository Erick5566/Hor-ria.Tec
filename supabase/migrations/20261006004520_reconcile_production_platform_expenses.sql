-- Production applied realtime/billing as several migrations, while Git contains
-- one consolidated migration. Preserve the original ledger: do not replay it.
-- Its CREATE TABLE omitted RLS and the creator FK present in the Git baseline.
alter table private.platform_expenses enable row level security;
revoke all on table private.platform_expenses from public, anon, authenticated;

do $reconcile$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'private.platform_expenses'::regclass
      and contype = 'f'
      and confrelid = 'auth.users'::regclass
      and conkey = array[(select attnum from pg_attribute
        where attrelid='private.platform_expenses'::regclass and attname='created_by')]::smallint[]
  ) then
    alter table private.platform_expenses
      add constraint platform_expenses_created_by_fkey
      foreign key (created_by) references auth.users(id) on delete set null not valid;
  end if;
end
$reconcile$;
alter table private.platform_expenses
  validate constraint platform_expenses_created_by_fkey;

-- The email baseline exists in production without a matching migration entry.
-- Verify its prerequisites without replaying or falsifying historical entries.
do $checkpoint$
begin
  if to_regclass('public.admin_email_notifications') is null
    or to_regprocedure('private.retry_admin_email_notifications()') is null
    or to_regprocedure('private.enqueue_admin_payment_email()') is null
    or to_regprocedure('public.admin_email_provider_credentials()') is null then
    raise exception 'Email baseline is incomplete; inspect production before deployment';
  end if;
end
$checkpoint$;
