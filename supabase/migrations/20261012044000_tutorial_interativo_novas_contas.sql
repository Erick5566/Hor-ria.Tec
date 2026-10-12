-- Horária: treinamento interativo persistente por conta.
-- Somente contas criadas após esta migração recebem boas-vindas automáticas.
-- Contas existentes não são incluídas no backfill.
begin;
create table if not exists public.tutorial_progresso (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','active','done','skipped')),
  passo integer not null default 0 check (passo between 0 and 500),
  atualizado_em timestamptz not null default now()
);
alter table public.tutorial_progresso enable row level security;
revoke all on public.tutorial_progresso from public, anon, authenticated;

create or replace function private.iniciar_tutorial_nova_conta()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.tutorial_progresso(usuario_id,status,passo)
  values(new.id,'pending',0)
  on conflict(usuario_id) do nothing;
  return new;
end;
$$;
revoke all on function private.iniciar_tutorial_nova_conta() from public,anon,authenticated;
drop trigger if exists criar_tutorial_nova_conta on auth.users;
create trigger criar_tutorial_nova_conta
after insert on auth.users
for each row execute function private.iniciar_tutorial_nova_conta();

create or replace function public.consultar_tutorial()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(
    (select jsonb_build_object(
      'automatico',true, 'status',t.status,'passo',t.passo
    ) from public.tutorial_progresso t where t.usuario_id=auth.uid()),
    jsonb_build_object('automatico',false,'status','none','passo',0)
  )
  where auth.uid() is not null
$$;
revoke all on function public.consultar_tutorial() from public,anon;
grant execute on function public.consultar_tutorial() to authenticated;

create or replace function public.atualizar_tutorial(p_status text,p_passo integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Acesso não autenticado'; end if;
  if p_status not in ('active','done','skipped')
    or p_passo is null or p_passo not between 0 and 500
  then raise exception 'Progresso do tutorial inválido'; end if;
  insert into public.tutorial_progresso(usuario_id,status,passo,atualizado_em)
  values(v_uid,p_status,p_passo,now())
  on conflict(usuario_id) do update
    set status=excluded.status,passo=excluded.passo,atualizado_em=now();
  return jsonb_build_object('status',p_status,'passo',p_passo);
end;
$$;
revoke all on function public.atualizar_tutorial(text,integer) from public,anon;
grant execute on function public.atualizar_tutorial(text,integer) to authenticated;
commit;
