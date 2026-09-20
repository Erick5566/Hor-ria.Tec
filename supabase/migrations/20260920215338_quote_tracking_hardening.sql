-- Mirror of the production quote/tracking hardening migration.
-- Applied in Supabase before this frontend rollout.
create table if not exists public.public_action_rate_limits (
  id bigint generated always as identity primary key,
  ip_hash text not null check (length(ip_hash) between 32 and 128),
  resource_hash text not null check (length(resource_hash) between 32 and 128),
  action text not null check (action in ('lookup','respond')),
  criado_em timestamptz not null default now()
);
alter table public.public_action_rate_limits enable row level security;
create index if not exists public_action_rate_limits_ip_action_created_idx
  on public.public_action_rate_limits(ip_hash, action, criado_em desc);
create index if not exists public_action_rate_limits_resource_created_idx
  on public.public_action_rate_limits(resource_hash, action, criado_em desc);
revoke all on table public.public_action_rate_limits from public, anon, authenticated;

create or replace function public.consume_public_action_rate_limit(
  p_ip_hash text,
  p_resource_hash text,
  p_action text
) returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  per_resource integer;
  per_ip integer;
  resource_limit integer;
  ip_limit integer;
begin
  if p_ip_hash is null or length(p_ip_hash) not between 32 and 128 then return false; end if;
  if p_resource_hash is null or length(p_resource_hash) not between 32 and 128 then return false; end if;
  if p_action not in ('lookup','respond') then return false; end if;
  resource_limit := case when p_action='respond' then 5 else 10 end;
  ip_limit := case when p_action='respond' then 12 else 30 end;
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash||':'||p_resource_hash||':'||p_action,0));
  delete from public.public_action_rate_limits
    where ip_hash=p_ip_hash and criado_em<now()-interval '24 hours';
  select count(*) into per_resource from public.public_action_rate_limits
    where ip_hash=p_ip_hash and resource_hash=p_resource_hash and action=p_action
      and criado_em>now()-interval '10 minutes';
  if per_resource>=resource_limit then return false; end if;
  select count(*) into per_ip from public.public_action_rate_limits
    where ip_hash=p_ip_hash and action=p_action and criado_em>now()-interval '10 minutes';
  if per_ip>=ip_limit then return false; end if;
  insert into public.public_action_rate_limits(ip_hash,resource_hash,action)
    values(p_ip_hash,p_resource_hash,p_action);
  return true;
end
$function$;
revoke execute on function public.consume_public_action_rate_limit(text,text,text)
  from public,anon,authenticated;
grant execute on function public.consume_public_action_rate_limit(text,text,text)
  to service_role;

-- salvar_orcamento, enviar_orcamento, responder_orcamento,
-- responder_orcamento_link, acompanhar_por_token and consultar_reparo were
-- hardened in production in this migration. Their canonical definitions are
-- intentionally kept by the Supabase migration history for this environment.

grant execute on function public.acompanhar_por_token(uuid) to service_role;
grant execute on function public.consultar_reparo(text,text) to service_role;
grant execute on function public.responder_orcamento_link(uuid,text,text,uuid)
  to service_role;
grant execute on function public.responder_orcamento(uuid,text,text,text,text)
  to service_role;
