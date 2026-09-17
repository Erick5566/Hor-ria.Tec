-- Identidade da plataforma, membros de empresas e base de assinatura.
-- Migração aditiva: mantém dono_id e todos os dados operacionais existentes.
begin;

create table public.perfis (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  telefone text,
  platform_role text not null default 'USER' check (platform_role in ('USER','SUPER_ADMIN')),
  ultimo_acesso_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.empresa_membros (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER','ADMIN','TECHNICIAN','ATTENDANT')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','INACTIVE')),
  ultimo_acesso_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id,usuario_id)
);

create index empresa_membros_usuario_idx on public.empresa_membros(usuario_id,status);

create table public.configuracoes_plataforma (
  id boolean primary key default true check (id),
  manutencao_global boolean not null default false,
  mensagem_manutencao text,
  registration_enabled boolean not null default true,
  max_companies integer not null default 10 check (max_companies between 1 and 100000),
  public_app_url text,
  feature_flags jsonb not null default '{"aiEnabled":false,"financialEnabled":true,"stockEnabled":true,"whatsappEnabled":false,"appointmentsEnabled":true}'::jsonb check (jsonb_typeof(feature_flags)='object'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

insert into public.configuracoes_plataforma(id) values(true);

alter table public.empresas
  add column status text not null default 'ACTIVE' check (status in ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELED','PENDING_DELETION')),
  add column manutencao_ativa boolean not null default false,
  add column mensagem_manutencao text,
  add column feature_flags jsonb not null default '{}'::jsonb check (jsonb_typeof(feature_flags)='object'),
  add column scheduled_deletion_at timestamptz,
  add column criado_em timestamptz not null default now(),
  add column atualizado_em timestamptz not null default now();

alter table public.empresas drop constraint if exists slug_rotas_reservadas;
alter table public.empresas add constraint slug_rotas_reservadas check (
  slug not in ('painel','agendar','acompanhar','api','admin','entrar','cadastro','manutencao','conta-bloqueada')
) not valid;

create table public.planos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  ativo boolean not null default true,
  recursos jsonb not null default '{}'::jsonb check (jsonb_typeof(recursos)='object'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

insert into public.planos(codigo,nome,recursos)
values('HORARIA','Horária','{"allStableFeatures":true}'::jsonb);

create table public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null unique references public.empresas(id),
  plano_id uuid not null references public.planos(id),
  status text not null check (status in ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED','CANCELED')),
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  next_billing_date timestamptz,
  cancelled_at timestamptz,
  external_subscription_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((status <> 'TRIAL') or trial_ends_at is not null)
);

create unique index assinaturas_external_uidx on public.assinaturas(external_subscription_id) where external_subscription_id is not null;

insert into public.perfis(usuario_id,email)
select u.id,coalesce(to_jsonb(u)->>'email','') from auth.users u
on conflict(usuario_id) do nothing;

insert into public.empresa_membros(empresa_id,usuario_id,role)
select id,dono_id,'OWNER' from public.empresas
on conflict(empresa_id,usuario_id) do nothing;

insert into public.assinaturas(empresa_id,plano_id,status,started_at,next_billing_date)
select e.id,p.id,'ACTIVE',e.criado_em,e.criado_em+interval '1 month'
from public.empresas e cross join public.planos p
where p.codigo='HORARIA'
on conflict(empresa_id) do nothing;

alter table public.perfis enable row level security;
alter table public.empresa_membros enable row level security;
alter table public.configuracoes_plataforma enable row level security;
alter table public.planos enable row level security;
alter table public.assinaturas enable row level security;

revoke all on public.perfis,public.empresa_membros,public.configuracoes_plataforma,public.planos,public.assinaturas from anon,authenticated;
grant select on public.perfis,public.empresa_membros,public.planos,public.assinaturas to authenticated;

create policy perfil_proprio_select on public.perfis for select to authenticated using(usuario_id=(select auth.uid()));
create policy membro_proprio_select on public.empresa_membros for select to authenticated using(usuario_id=(select auth.uid()));
create policy planos_authenticated_select on public.planos for select to authenticated using(ativo);
create policy assinatura_membro_select on public.assinaturas for select to authenticated using(exists(
  select 1 from public.empresa_membros m where m.empresa_id=assinaturas.empresa_id and m.usuario_id=(select auth.uid()) and m.status='ACTIVE'
));

create or replace function private.is_super_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.perfis p where p.usuario_id=auth.uid() and p.platform_role='SUPER_ADMIN')
$$;

create or replace function private.is_company_member(p_empresa uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.empresa_membros m where m.empresa_id=p_empresa and m.usuario_id=auth.uid() and m.status='ACTIVE')
$$;

create or replace function private.can_manage_company(p_empresa uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.empresa_membros m where m.empresa_id=p_empresa and m.usuario_id=auth.uid() and m.status='ACTIVE' and m.role in ('OWNER','ADMIN'))
$$;

create or replace function private.company_operational(p_empresa uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.empresas e cross join public.configuracoes_plataforma c
  where e.id=p_empresa and e.status in ('TRIAL','ACTIVE','PAST_DUE') and not e.manutencao_ativa and not c.manutencao_global
 )
$$;

create or replace function private.can_access_company(p_empresa uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_company_member(p_empresa) and private.company_operational(p_empresa)
$$;

create or replace function private.public_company_available(p_empresa uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.company_operational(p_empresa)
$$;

revoke all on function private.is_super_admin(),private.is_company_member(uuid),private.can_manage_company(uuid),private.company_operational(uuid),private.can_access_company(uuid),private.public_company_available(uuid) from public,anon,authenticated;
grant execute on function private.is_super_admin(),private.is_company_member(uuid),private.can_manage_company(uuid),private.company_operational(uuid),private.can_access_company(uuid),private.public_company_available(uuid) to authenticated;
grant execute on function private.public_company_available(uuid) to anon;

create or replace function private.assert_registration_available() returns void language plpgsql security definer set search_path='' as $$
declare config public.configuracoes_plataforma; total integer;begin
 perform pg_advisory_xact_lock(hashtext('horaria-registration'));
 select * into strict config from public.configuracoes_plataforma where id;
 select count(*) into total from public.empresas;
 if not config.registration_enabled or total>=config.max_companies then
  raise exception 'As novas vagas para esta fase da Horária estão temporariamente encerradas';
 end if;
end $$;

create or replace function private.handle_new_auth_user() returns trigger language plpgsql security definer set search_path='' as $$
declare meta jsonb; nome_empresa text; slug_empresa text; responsavel text; empresa uuid; plano uuid;begin
 meta:=coalesce(to_jsonb(new)->'raw_user_meta_data','{}'::jsonb);
 responsavel:=nullif(trim(meta->>'responsible_name'),'');
 insert into public.perfis(usuario_id,nome,email) values(new.id,responsavel,coalesce(to_jsonb(new)->>'email','')) on conflict(usuario_id) do nothing;
 nome_empresa:=nullif(trim(meta->>'company_name'),'');
 slug_empresa:=nullif(lower(trim(meta->>'company_slug')),'');
 if nome_empresa is null and slug_empresa is null then return new;end if;
 if length(nome_empresa) not between 2 and 100 or slug_empresa !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Dados da empresa inválidos';end if;
 perform private.assert_registration_available();
 insert into public.empresas(dono_id,nome,slug,status) values(new.id,nome_empresa,slug_empresa,'TRIAL') returning id into empresa;
 insert into public.empresa_membros(empresa_id,usuario_id,role) values(empresa,new.id,'OWNER');
 select id into strict plano from public.planos where codigo='HORARIA' and ativo;
 insert into public.assinaturas(empresa_id,plano_id,status,trial_ends_at,next_billing_date) values(empresa,plano,'TRIAL',now()+interval '7 days',now()+interval '7 days');
 return new;
end $$;

drop trigger if exists horaria_novo_usuario on auth.users;
create trigger horaria_novo_usuario after insert on auth.users for each row execute function private.handle_new_auth_user();

create or replace function public.registration_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'enabled',c.registration_enabled and (select count(*) from public.empresas)<c.max_companies,
  'registrationEnabled',c.registration_enabled,
  'currentCompanies',(select count(*) from public.empresas),
  'maxCompanies',c.max_companies,
  'globalMaintenance',c.manutencao_global,
  'publicAppUrl',c.public_app_url
 ) from public.configuracoes_plataforma c where c.id
$$;

create or replace function public.access_context() returns jsonb language sql stable security definer set search_path='' as $$
 with member as (
  select m.*,e.nome,e.slug,e.status as empresa_status,e.manutencao_ativa,e.mensagem_manutencao,e.feature_flags,e.scheduled_deletion_at
  from public.empresa_membros m join public.empresas e on e.id=m.empresa_id
  where m.usuario_id=auth.uid() and m.status='ACTIVE'
  order by case m.role when 'OWNER' then 1 when 'ADMIN' then 2 else 3 end limit 1
 ), config as (select * from public.configuracoes_plataforma where id)
 select jsonb_build_object(
  'authenticated',auth.uid() is not null,
  'userId',auth.uid(),
  'platformRole',coalesce(p.platform_role,'USER'),
  'isSuperAdmin',coalesce(p.platform_role='SUPER_ADMIN',false),
  'globalMaintenance',config.manutencao_global,
  'maintenanceMessage',config.mensagem_manutencao,
  'registrationEnabled',config.registration_enabled,
  'maxCompanies',config.max_companies,
  'publicAppUrl',config.public_app_url,
  'company',case when member.empresa_id is null then null else jsonb_build_object(
    'id',member.empresa_id,'name',member.nome,'slug',member.slug,'role',member.role,
    'status',member.empresa_status,'maintenance',member.manutencao_ativa,
    'maintenanceMessage',member.mensagem_manutencao,'scheduledDeletionAt',member.scheduled_deletion_at,
    'featureFlags',config.feature_flags||member.feature_flags
  ) end,
  'subscription',case when a.id is null then null else jsonb_build_object(
    'id',a.id,'status',a.status,'startedAt',a.started_at,'trialEndsAt',a.trial_ends_at,
    'nextBillingDate',a.next_billing_date,'cancelledAt',a.cancelled_at
  ) end
 )
 from config left join public.perfis p on p.usuario_id=auth.uid()
 left join member on true left join public.assinaturas a on a.empresa_id=member.empresa_id
$$;

create or replace function public.registrar_acesso() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then return;end if;
 update public.perfis set ultimo_acesso_em=now(),atualizado_em=now() where usuario_id=auth.uid() and (ultimo_acesso_em is null or ultimo_acesso_em<now()-interval '15 minutes');
 update public.empresa_membros set ultimo_acesso_em=now(),atualizado_em=now() where usuario_id=auth.uid() and status='ACTIVE' and (ultimo_acesso_em is null or ultimo_acesso_em<now()-interval '15 minutes');
end $$;

create or replace function public.configurar_empresa(p_nome text,p_slug text,p_horario jsonb,p_endereco boolean,p_servicos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare empresa uuid;item jsonb;plano uuid;begin
 if auth.uid() is null then raise exception 'Entre na sua conta';end if;
 if exists(select 1 from public.empresa_membros where usuario_id=auth.uid() and status='ACTIVE') then raise exception 'Sua conta já possui uma empresa';end if;
 perform private.assert_registration_available();
 if jsonb_typeof(p_servicos)<>'array' or jsonb_array_length(p_servicos)<1 or jsonb_array_length(p_servicos)>50 then raise exception 'Cadastre entre 1 e 50 serviços';end if;
 insert into public.empresas(dono_id,nome,slug,horario,solicitar_endereco,status) values(auth.uid(),p_nome,p_slug,p_horario,p_endereco,'TRIAL') returning id into empresa;
 insert into public.empresa_membros(empresa_id,usuario_id,role) values(empresa,auth.uid(),'OWNER');
 select id into strict plano from public.planos where codigo='HORARIA' and ativo;
 insert into public.assinaturas(empresa_id,plano_id,status,trial_ends_at,next_billing_date) values(empresa,plano,'TRIAL',now()+interval '7 days',now()+interval '7 days');
 for item in select * from jsonb_array_elements(p_servicos) loop
  insert into public.servicos(empresa_id,nome,duracao) values(empresa,item->>'nome',(item->>'duracao')::integer);
 end loop;
 return empresa;
end $$;

revoke all on function private.assert_registration_available(),private.handle_new_auth_user(),public.registration_status(),public.access_context(),public.registrar_acesso(),public.configurar_empresa(text,text,jsonb,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.registration_status() to anon,authenticated;
grant execute on function public.access_context(),public.registrar_acesso(),public.configurar_empresa(text,text,jsonb,boolean,jsonb) to authenticated;

commit;
