-- Tutorial interativo por usuário, sem afetar quem já tinha cadastro.
-- Progresso isolado por usuário e persistente entre dispositivos.
begin;
create table if not exists private.tutorial_rollout (
  id boolean primary key default true check(id),
  activated_at timestamptz not null default now()
);
insert into private.tutorial_rollout(id) values(true) on conflict(id) do nothing;

create table if not exists private.user_tutorial_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version integer not null default 1,
  step integer not null default 0 check(step between 0 and 150),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','PAUSED','COMPLETED')),
  updated_at timestamptz not null default now()
);
alter table private.user_tutorial_progress enable row level security;
revoke all on private.tutorial_rollout, private.user_tutorial_progress from public,anon,authenticated;

create or replace function public.tutorial_get_progress()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid := auth.uid(); v_since timestamptz; v_created timestamptz; v_progress private.user_tutorial_progress;
begin
  if v_user is null then raise exception 'Autenticação necessária'; end if;
  select activated_at into v_since from private.tutorial_rollout where id=true;
  select criado_em into v_created from public.perfis where usuario_id=v_user;
  select * into v_progress from private.user_tutorial_progress where user_id=v_user;
  return jsonb_build_object(
    'eligible', v_created is not null and v_since is not null and v_created >= v_since,
    'status', case when v_progress.user_id is null then null else v_progress.status end,
    'step', coalesce(v_progress.step,0),
    'version',1
  );
end $$;

create or replace function public.tutorial_save_progress(p_step integer,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Autenticação necessária'; end if;
  if p_step is null or p_step not between 0 and 150 or p_status not in ('ACTIVE','PAUSED','COMPLETED') then
    raise exception 'Progresso inválido';
  end if;
  insert into private.user_tutorial_progress(user_id,version,step,status,updated_at)
  values(v_user,1,p_step,p_status,now())
  on conflict(user_id) do update
  set version=1,step=excluded.step,status=excluded.status,updated_at=excluded.updated_at;
  return jsonb_build_object('step',p_step,'status',p_status,'version',1);
end $$;

revoke all on function public.tutorial_get_progress(),public.tutorial_save_progress(integer,text) from public,anon;
grant execute on function public.tutorial_get_progress(),public.tutorial_save_progress(integer,text) to authenticated;
commit;
