create table if not exists public.booking_rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null check (length(ip_hash) between 32 and 128),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  criado_em timestamptz not null default now()
);

alter table public.booking_rate_limits enable row level security;

create index if not exists booking_rate_limits_ip_slug_created_idx
  on public.booking_rate_limits(ip_hash, slug, criado_em desc);

create index if not exists booking_rate_limits_created_idx
  on public.booking_rate_limits(criado_em);

create or replace function public.consume_public_booking_rate_limit(
  p_ip_hash text,
  p_slug text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  per_tenant integer;
  global_ip integer;
begin
  if p_ip_hash is null or length(p_ip_hash) not between 32 and 128 then
    return false;
  end if;
  if p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash || ':' || p_slug, 0));

  delete from public.booking_rate_limits
  where ip_hash = p_ip_hash
    and criado_em < now() - interval '24 hours';

  select count(*) into per_tenant
  from public.booking_rate_limits
  where ip_hash = p_ip_hash
    and slug = p_slug
    and criado_em > now() - interval '10 minutes';

  if per_tenant >= 10 then return false; end if;

  select count(*) into global_ip
  from public.booking_rate_limits
  where ip_hash = p_ip_hash
    and criado_em > now() - interval '10 minutes';

  if global_ip >= 30 then return false; end if;

  insert into public.booking_rate_limits(ip_hash, slug)
  values (p_ip_hash, p_slug);

  return true;
end
$function$;

revoke all on table public.booking_rate_limits from public, anon, authenticated;
revoke execute on function public.consume_public_booking_rate_limit(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_public_booking_rate_limit(text, text)
  to service_role;

grant execute on function public.solicitar_reparo(
  text, jsonb, jsonb, text, uuid, timestamptz, text
) to service_role;
