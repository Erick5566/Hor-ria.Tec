begin;
create extension if not exists btree_gist;
create table public.empresas (
 id uuid primary key default gen_random_uuid(),
 dono_id uuid not null unique references auth.users(id),
 nome text not null check(length(nome) between 2 and 100),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 timezone text not null default 'America/Sao_Paulo' check(timezone = 'America/Sao_Paulo'),
 horario jsonb not null default '{"1":["09:00","18:00"],"2":["09:00","18:00"],"3":["09:00","18:00"],"4":["09:00","18:00"],"5":["09:00","18:00"]}',
 solicitar_endereco boolean not null default false
);
create table public.servicos (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 nome text not null check(length(nome) between 2 and 100), duracao integer not null check(duracao between 5 and 480),
 unique(id,empresa_id)
);
-- Bloqueios compartilham a tabela para garantir exclusão atômica entre todos os intervalos.
create table public.agendamentos (
 id uuid primary key default gen_random_uuid(), empresa_id uuid not null references public.empresas(id),
 servico_id uuid, nome_cliente text, telefone text, endereco text, descricao text,
 inicio timestamptz not null, fim timestamptz not null,
 status text not null default 'aguardando' check(status in ('aguardando','em_atendimento','concluido')),
 bloqueio boolean not null default false,
 foreign key(servico_id,empresa_id) references public.servicos(id,empresa_id),
 check(fim > inicio), check(length(descricao) <= 500), check(length(endereco) <= 300),
 check(bloqueio or (servico_id is not null and nome_cliente is not null and telefone is not null and length(trim(nome_cliente)) between 2 and 100 and telefone ~ '^[+0-9 ()-]{8,25}$')),
 exclude using gist (empresa_id with =, tstzrange(inicio,fim,'[)') with &&)
);
create index on public.agendamentos(empresa_id,inicio);
create index on public.servicos(empresa_id);
alter table public.empresas enable row level security;
alter table public.servicos enable row level security;
alter table public.agendamentos enable row level security;
create policy dono on public.empresas for all to authenticated using(dono_id = (select auth.uid())) with check(dono_id = (select auth.uid()));
create policy dono on public.servicos for all to authenticated using(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid()))) with check(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid())));
create policy dono on public.agendamentos for all to authenticated using(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid()))) with check(exists(select 1 from public.empresas e where e.id=empresa_id and e.dono_id=(select auth.uid())));
create policy reserva_publica on public.agendamentos for insert to anon with check(not bloqueio and status='aguardando');
revoke all on public.empresas,public.servicos,public.agendamentos from anon,authenticated;
grant select,insert,update,delete on public.empresas,public.servicos,public.agendamentos to authenticated;
grant insert(empresa_id,servico_id,nome_cliente,telefone,endereco,descricao,inicio) on public.agendamentos to anon;

create function public.validar_agendamento() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.empresas; minutos integer; local_inicio timestamp; janela jsonb;
begin
 if TG_OP='UPDATE' then
  if (new.empresa_id,new.servico_id,new.inicio,new.fim,new.bloqueio) is distinct from (old.empresa_id,old.servico_id,old.inicio,old.fim,old.bloqueio) then raise exception 'Para alterar o horário, remova e crie uma nova reserva'; end if;
  if new.status <> old.status and not ((old.status='aguardando' and new.status='em_atendimento') or (old.status='em_atendimento' and new.status='concluido')) then raise exception 'Transição de status inválida'; end if;
  return new;
 end if;
 select * into strict e from public.empresas where id=new.empresa_id;
 if new.inicio <= now() then raise exception 'Escolha um horário futuro'; end if;
 if new.bloqueio then
  if auth.uid() is distinct from e.dono_id then raise exception 'Bloqueio não autorizado'; end if;
  return new;
 end if;
 select duracao into strict minutos from public.servicos where id=new.servico_id and empresa_id=new.empresa_id;
 new.fim := new.inicio + make_interval(mins=>minutos);
 local_inicio := new.inicio at time zone e.timezone;
 janela := e.horario -> extract(dow from local_inicio)::integer::text;
 if janela is null or local_inicio::time < (janela->>0)::time or (new.fim at time zone e.timezone)::date <> local_inicio::date or (new.fim at time zone e.timezone)::time > (janela->>1)::time or extract(second from local_inicio)<>0 or extract(minute from local_inicio)::integer % 15 <> 0 then raise exception 'Horário indisponível'; end if;
 if e.solicitar_endereco and coalesce(length(trim(new.endereco)),0)<5 then raise exception 'Informe o endereço'; end if;
 return new;
end $$;
create trigger validar before insert or update on public.agendamentos for each row execute function public.validar_agendamento();

create function public.catalogo(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'nome',e.nome,'slug',e.slug,'horario',e.horario,'solicitar_endereco',e.solicitar_endereco,'servicos',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'nome',s.nome,'duracao',s.duracao) order by s.nome) from public.servicos s where s.empresa_id=e.id),'[]'::jsonb)) from public.empresas e where e.slug=p_slug
$$;
create function public.horarios_disponiveis(p_slug text,p_servico uuid,p_dia date) returns table(inicio timestamptz) language sql stable security definer set search_path='' as $$
 with config as (
 select e.*,s.duracao,e.horario->extract(dow from p_dia)::integer::text as janela from public.empresas e join public.servicos s on s.empresa_id=e.id where e.slug=p_slug and s.id=p_servico and p_dia between current_date and current_date+90
 ), slots as (
 select c.id,g as inicio,g+make_interval(mins=>c.duracao) as fim from config c cross join lateral generate_series((p_dia+(c.janela->>0)::time) at time zone c.timezone, ((p_dia+(c.janela->>1)::time) at time zone c.timezone)-make_interval(mins=>c.duracao),interval '15 minutes') g
 ) select s.inicio from slots s where s.inicio>now() and not exists(select 1 from public.agendamentos a where a.empresa_id=s.id and tstzrange(a.inicio,a.fim,'[)') && tstzrange(s.inicio,s.fim,'[)')) order by s.inicio
$$;
revoke all on function public.validar_agendamento(),public.catalogo(text),public.horarios_disponiveis(text,uuid,date) from public;
grant execute on function public.catalogo(text),public.horarios_disponiveis(text,uuid,date) to anon,authenticated;
commit;
