begin;

revoke all privileges on table public.notification_reads from anon;
revoke all privileges on table public.notification_reads from authenticated;

grant select, insert, update, delete
on table public.notification_reads
to authenticated;

commit;