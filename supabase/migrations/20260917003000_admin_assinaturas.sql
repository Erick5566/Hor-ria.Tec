-- Administração privada da plataforma, auditoria e processamento idempotente de cobrança.
begin;

create table public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  assinatura_id uuid not null references public.assinaturas(id),
  provider text not null,
  external_payment_id text not null,
  valor numeric(12,2),
  moeda text not null default 'BRL',
  status text not null check(status in ('APPROVED','REJECTED','PENDING','REFUNDED')),
  paid_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  unique(provider,external_payment_id)
);

create table public.eventos_webhook (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'RECEIVED' check(status in ('RECEIVED','PROCESSED','FAILED','IGNORED')),
  erro text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  unique(provider,event_id)
);

create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id),
  action text not null,
  empresa_id uuid references public.empresas(id),
  motivo text,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index pagamentos_empresa_idx on public.pagamentos(empresa_id,criado_em desc);
create index admin_audit_empresa_idx on public.admin_audit_logs(empresa_id,criado_em desc);
create index admin_audit_actor_idx on public.admin_audit_logs(actor_user_id,criado_em desc);

alter table public.pagamentos enable row level security;
alter table public.eventos_webhook enable row level security;
alter table public.admin_audit_logs enable row level security;
revoke all on public.pagamentos,public.eventos_webhook,public.admin_audit_logs from anon,authenticated;

create or replace function private.require_super_admin() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not private.is_super_admin() then raise exception 'Acesso administrativo negado';end if;
end $$;

create or replace function public.admin_list_companies() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform private.require_super_admin();
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',e.id,'name',e.nome,'slug',e.slug,'responsible',coalesce(p.nome,''),'email',coalesce(p.email,''),'phone',e.telefone,
  'createdAt',e.criado_em,'plan',pl.nome,'subscriptionStatus',a.status,'nextBillingDate',a.next_billing_date,
  'lastAccessAt',stats.ultimo_acesso,'usersCount',stats.usuarios,'customersCount',stats.clientes,'ordersCount',stats.ordens,
  'storageBytes',stats.storage_bytes,'status',e.status,'maintenance',e.manutencao_ativa,'scheduledDeletionAt',e.scheduled_deletion_at
 ) order by e.criado_em desc),'[]'::jsonb) into result
 from public.empresas e
 join public.perfis p on p.usuario_id=e.dono_id
 left join public.assinaturas a on a.empresa_id=e.id left join public.planos pl on pl.id=a.plano_id
 cross join lateral (
  select
   (select max(m.ultimo_acesso_em) from public.empresa_membros m where m.empresa_id=e.id) ultimo_acesso,
   (select count(*) from public.empresa_membros m where m.empresa_id=e.id and m.status='ACTIVE') usuarios,
   (select count(*) from public.clientes c where c.empresa_id=e.id) clientes,
   (select count(*) from public.ordens_servico o where o.empresa_id=e.id) ordens,
   (select coalesce(sum(case when coalesce(s.metadata->>'size','') ~ '^[0-9]+$' then (s.metadata->>'size')::bigint else 0 end),0) from storage.objects s where s.bucket_id='os-fotos' and s.name like e.id::text||'/%') storage_bytes
 ) stats;
 return result;
end $$;

create or replace function public.admin_company_detail(p_empresa uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform private.require_super_admin();
 select jsonb_build_object(
  'id',e.id,'name',e.nome,'slug',e.slug,'responsible',coalesce(p.nome,''),'email',coalesce(p.email,''),'phone',e.telefone,
  'createdAt',e.criado_em,'status',e.status,'maintenance',e.manutencao_ativa,'maintenanceMessage',e.mensagem_manutencao,
  'scheduledDeletionAt',e.scheduled_deletion_at,'featureFlags',c.feature_flags||e.feature_flags,
  'subscription',jsonb_build_object('id',a.id,'plan',pl.nome,'status',a.status,'startedAt',a.started_at,'trialEndsAt',a.trial_ends_at,'nextBillingDate',a.next_billing_date,'cancelledAt',a.cancelled_at,'externalId',a.external_subscription_id),
  'usersCount',(select count(*) from public.empresa_membros m where m.empresa_id=e.id and m.status='ACTIVE'),
  'customersCount',(select count(*) from public.clientes x where x.empresa_id=e.id),
  'ordersCount',(select count(*) from public.ordens_servico x where x.empresa_id=e.id),
  'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.usuario_id,'role',m.role,'status',m.status,'lastAccessAt',m.ultimo_acesso_em,'name',mp.nome,'email',mp.email) order by m.criado_em) from public.empresa_membros m left join public.perfis mp on mp.usuario_id=m.usuario_id where m.empresa_id=e.id),'[]'::jsonb)
 ) into result
 from public.empresas e join public.perfis p on p.usuario_id=e.dono_id
 cross join public.configuracoes_plataforma c left join public.assinaturas a on a.empresa_id=e.id left join public.planos pl on pl.id=a.plano_id
 where e.id=p_empresa and c.id;
 return result;
end $$;

create or replace function public.admin_platform_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform private.require_super_admin();
 select jsonb_build_object('globalMaintenance',manutencao_global,'maintenanceMessage',mensagem_manutencao,'registrationEnabled',registration_enabled,'maxCompanies',max_companies,'currentCompanies',(select count(*) from public.empresas),'publicAppUrl',public_app_url,'featureFlags',feature_flags) into result from public.configuracoes_plataforma where id;
 return result;
end $$;

create or replace function public.admin_audit_recent(p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform private.require_super_admin();
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'action',x.action,'companyId',x.empresa_id,'company',e.nome,'reason',x.motivo,'details',x.detalhes,'createdAt',x.criado_em,'actorEmail',p.email) order by x.criado_em desc),'[]'::jsonb) into result
 from (select * from public.admin_audit_logs order by criado_em desc limit least(greatest(p_limit,1),200)) x
 left join public.empresas e on e.id=x.empresa_id left join public.perfis p on p.usuario_id=x.actor_user_id;
 return result;
end $$;

create or replace function public.admin_update_company_state(p_empresa uuid,p_action text,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare current_company public.empresas;begin
 perform private.require_super_admin();
 select * into strict current_company from public.empresas where id=p_empresa for update;
 if p_action='SUSPEND' then
  update public.empresas set status='SUSPENDED',atualizado_em=now() where id=p_empresa;
  update public.assinaturas set status='SUSPENDED',atualizado_em=now() where empresa_id=p_empresa and status<>'CANCELED';
 elsif p_action='REACTIVATE' then
  if current_company.scheduled_deletion_at is not null and current_company.scheduled_deletion_at<=now() then raise exception 'O período seguro de reativação terminou';end if;
  update public.empresas set status='ACTIVE',scheduled_deletion_at=null,atualizado_em=now() where id=p_empresa;
  update public.assinaturas set status='ACTIVE',cancelled_at=null,atualizado_em=now() where empresa_id=p_empresa;
 elsif p_action='CANCEL' then
  update public.empresas set status='CANCELED',scheduled_deletion_at=now()+interval '30 days',atualizado_em=now() where id=p_empresa;
  update public.assinaturas set status='CANCELED',cancelled_at=now(),atualizado_em=now() where empresa_id=p_empresa;
 elsif p_action='ENABLE_MAINTENANCE' then
  update public.empresas set manutencao_ativa=true,mensagem_manutencao=nullif(trim(p_reason),''),atualizado_em=now() where id=p_empresa;
 elsif p_action='DISABLE_MAINTENANCE' then
  update public.empresas set manutencao_ativa=false,mensagem_manutencao=null,atualizado_em=now() where id=p_empresa;
 else raise exception 'Ação administrativa inválida';end if;
 insert into public.admin_audit_logs(actor_user_id,action,empresa_id,motivo,detalhes) values(auth.uid(),p_action,p_empresa,nullif(trim(p_reason),''),jsonb_build_object('previousStatus',current_company.status,'previousMaintenance',current_company.manutencao_ativa));
end $$;

create or replace function public.admin_update_platform(p_changes jsonb,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare allowed text[]:=array['globalMaintenance','maintenanceMessage','registrationEnabled','maxCompanies','publicAppUrl','featureFlags'];unknown_key text;begin
 perform private.require_super_admin();
 select key into unknown_key from jsonb_object_keys(p_changes) key where not(key=any(allowed)) limit 1;
 if unknown_key is not null then raise exception 'Configuração não permitida: %',unknown_key;end if;
 update public.configuracoes_plataforma set
  manutencao_global=coalesce((p_changes->>'globalMaintenance')::boolean,manutencao_global),
  mensagem_manutencao=case when p_changes?'maintenanceMessage' then nullif(trim(p_changes->>'maintenanceMessage'),'') else mensagem_manutencao end,
  registration_enabled=coalesce((p_changes->>'registrationEnabled')::boolean,registration_enabled),
  max_companies=coalesce((p_changes->>'maxCompanies')::integer,max_companies),
  public_app_url=case when p_changes?'publicAppUrl' then nullif(trim(p_changes->>'publicAppUrl'),'') else public_app_url end,
  feature_flags=case when p_changes?'featureFlags' then p_changes->'featureFlags' else feature_flags end,
  atualizado_em=now(),atualizado_por=auth.uid()
 where id;
 insert into public.admin_audit_logs(actor_user_id,action,motivo,detalhes) values(auth.uid(),'UPDATE_PLATFORM',nullif(trim(p_reason),''),p_changes);
end $$;

create or replace function public.admin_update_company_features(p_empresa uuid,p_features jsonb,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare allowed text[]:=array['aiEnabled','financialEnabled','stockEnabled','whatsappEnabled','appointmentsEnabled'];unknown_key text;begin
 perform private.require_super_admin();
 if jsonb_typeof(p_features)<>'object' then raise exception 'Configuração de recursos inválida';end if;
 select key into unknown_key from jsonb_object_keys(p_features) key where not(key=any(allowed)) limit 1;
 if unknown_key is not null then raise exception 'Recurso não permitido: %',unknown_key;end if;
 update public.empresas set feature_flags=p_features,atualizado_em=now() where id=p_empresa;
 if not found then raise exception 'Empresa não encontrada';end if;
 insert into public.admin_audit_logs(actor_user_id,action,empresa_id,motivo,detalhes) values(auth.uid(),'UPDATE_COMPANY_FEATURES',p_empresa,nullif(trim(p_reason),''),p_features);
end $$;

create or replace function private.process_billing_event(p_provider text,p_event_id text,p_event_type text,p_empresa uuid,p_external_subscription text default null,p_external_payment text default null,p_next_billing timestamptz default null,p_amount numeric default null,p_currency text default 'BRL',p_payload jsonb default '{}'::jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare event_row uuid;subscription public.assinaturas;begin
 insert into public.eventos_webhook(provider,event_id,event_type,payload) values(p_provider,p_event_id,p_event_type,p_payload) on conflict(provider,event_id) do nothing returning id into event_row;
 if event_row is null then return false;end if;
 select * into strict subscription from public.assinaturas where empresa_id=p_empresa for update;
 if p_event_type in ('payment.approved','subscription.created') then
  update public.assinaturas set status='ACTIVE',external_subscription_id=coalesce(p_external_subscription,external_subscription_id),next_billing_date=coalesce(p_next_billing,next_billing_date),cancelled_at=null,atualizado_em=now() where id=subscription.id;
  update public.empresas set status='ACTIVE',scheduled_deletion_at=null,atualizado_em=now() where id=p_empresa;
  if p_external_payment is not null then insert into public.pagamentos(empresa_id,assinatura_id,provider,external_payment_id,valor,moeda,status,paid_at,payload) values(p_empresa,subscription.id,p_provider,p_external_payment,p_amount,p_currency,'APPROVED',now(),p_payload) on conflict(provider,external_payment_id) do nothing;end if;
 elsif p_event_type in ('payment.failed','payment.past_due') then
  update public.assinaturas set status='PAST_DUE',atualizado_em=now() where id=subscription.id;
  update public.empresas set status='PAST_DUE',atualizado_em=now() where id=p_empresa and status not in ('SUSPENDED','CANCELED');
  if p_external_payment is not null then insert into public.pagamentos(empresa_id,assinatura_id,provider,external_payment_id,valor,moeda,status,payload) values(p_empresa,subscription.id,p_provider,p_external_payment,p_amount,p_currency,'REJECTED',p_payload) on conflict(provider,external_payment_id) do nothing;end if;
 elsif p_event_type='subscription.canceled' then
  update public.assinaturas set status='CANCELED',cancelled_at=now(),atualizado_em=now() where id=subscription.id;
  update public.empresas set status='CANCELED',scheduled_deletion_at=now()+interval '30 days',atualizado_em=now() where id=p_empresa;
 else
  update public.eventos_webhook set status='IGNORED',processado_em=now() where id=event_row;
  return true;
 end if;
 update public.eventos_webhook set status='PROCESSED',processado_em=now() where id=event_row;
 return true;
exception when others then
 update public.eventos_webhook set status='FAILED',erro=left(sqlerrm,1000),processado_em=now() where id=event_row;
 raise;
end $$;

revoke all on function private.require_super_admin(),private.process_billing_event(text,text,text,uuid,text,text,timestamptz,numeric,text,jsonb),public.admin_list_companies(),public.admin_company_detail(uuid),public.admin_platform_overview(),public.admin_audit_recent(integer),public.admin_update_company_state(uuid,text,text),public.admin_update_platform(jsonb,text),public.admin_update_company_features(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.admin_list_companies(),public.admin_company_detail(uuid),public.admin_platform_overview(),public.admin_audit_recent(integer),public.admin_update_company_state(uuid,text,text),public.admin_update_platform(jsonb,text),public.admin_update_company_features(uuid,jsonb,text) to authenticated;

commit;
