-- Permite que administradores, além do proprietário, reservem bloqueios
-- na agenda. Demais membros continuam usando a agenda sem controlar bloqueios.
begin;

create or replace function public.validar_agendamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  e public.empresas;
  minutos integer;
  local_inicio timestamp;
  janela jsonb;
begin
  if TG_OP = 'UPDATE' then
    if (
      new.empresa_id,
      new.servico_id,
      new.inicio,
      new.fim,
      new.bloqueio
    ) is distinct from (
      old.empresa_id,
      old.servico_id,
      old.inicio,
      old.fim,
      old.bloqueio
    ) then
      raise exception 'Para alterar o horário, remova e crie uma nova reserva';
    end if;

    if new.status <> old.status
       and not (
         (old.status = 'aguardando' and new.status = 'em_atendimento')
         or
         (old.status = 'em_atendimento' and new.status = 'concluido')
       ) then
      raise exception 'Transição de status inválida';
    end if;

    return new;
  end if;

  select *
    into strict e
  from public.empresas
  where id = new.empresa_id;

  if new.inicio <= now() then
    raise exception 'Escolha um horário futuro';
  end if;

  if new.bloqueio then
    if not private.can_manage_company(new.empresa_id) then
      raise exception 'Bloqueio não autorizado';
    end if;
    return new;
  end if;

  select duracao
    into strict minutos
  from public.servicos
  where id = new.servico_id
    and empresa_id = new.empresa_id;

  new.fim := new.inicio + make_interval(mins => minutos);
  local_inicio := new.inicio at time zone e.timezone;
  janela := e.horario -> extract(dow from local_inicio)::integer::text;

  if janela is null
     or local_inicio::time < (janela->>0)::time
     or (new.fim at time zone e.timezone)::date <> local_inicio::date
     or (new.fim at time zone e.timezone)::time > (janela->>1)::time
     or extract(second from local_inicio) <> 0
     or extract(minute from local_inicio)::integer % 15 <> 0 then
    raise exception 'Horário indisponível';
  end if;

  if e.solicitar_endereco
     and coalesce(length(trim(new.endereco)), 0) < 5 then
    raise exception 'Informe o endereço';
  end if;

  return new;
end
$function$;

drop policy if exists agendamentos_member_delete on public.agendamentos;
create policy agendamentos_member_delete
on public.agendamentos
for delete
to authenticated
using (
  private.can_access_company(empresa_id)
  and private.feature_enabled(empresa_id, 'appointmentsEnabled')
  and (
    not bloqueio
    or private.can_manage_company(empresa_id)
  )
);

commit;
