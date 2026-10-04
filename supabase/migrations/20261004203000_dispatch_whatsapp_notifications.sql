alter table public.notificacoes
  add column if not exists dispatch_token uuid;

update public.notificacoes
set dispatch_token = gen_random_uuid()
where dispatch_token is null;

alter table public.notificacoes
  alter column dispatch_token set default gen_random_uuid(),
  alter column dispatch_token set not null;

alter table public.configuracoes_plataforma
  add column if not exists notification_dispatch_url text;

create or replace function private.dispatch_whatsapp_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  dispatch_url text;
begin
  if new.canal <> 'whatsapp' or new.status <> 'pendente' then
    return new;
  end if;

  if not private.feature_enabled(new.empresa_id, 'whatsappEnabled') then
    return new;
  end if;

  select nullif(trim(c.notification_dispatch_url), '')
    into dispatch_url
  from public.configuracoes_plataforma c
  where c.id;

  if dispatch_url is null then
    return new;
  end if;

  if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    return new;
  end if;

  perform net.http_post(
    url := dispatch_url,
    body := jsonb_build_object(
      'id', new.id,
      'dispatchToken', new.dispatch_token
    ),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    raise warning 'Falha ao enfileirar despacho WhatsApp da notificação %: %',
      new.id,
      sqlerrm;
    return new;
end
$function$;

revoke all on function private.dispatch_whatsapp_notification() from public;
revoke all on function private.dispatch_whatsapp_notification() from anon;
revoke all on function private.dispatch_whatsapp_notification() from authenticated;

drop trigger if exists dispatch_whatsapp_notification on public.notificacoes;

create trigger dispatch_whatsapp_notification
after insert on public.notificacoes
for each row
execute function private.dispatch_whatsapp_notification();
