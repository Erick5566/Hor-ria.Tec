begin;

create table private.admin_payment_confirmation_operations (
  id uuid primary key default gen_random_uuid(),
  confirmation_id uuid not null unique default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id),
  admin_user_id uuid not null references auth.users(id),
  status text not null default 'pending' check(status in ('pending','processing','completed','requires_review')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
-- One unresolved intent, not permanent deduplication by company or amount.
create unique index admin_payment_one_unresolved on private.admin_payment_confirmation_operations(empresa_id)
  where status <> 'completed';
create index admin_payment_latest on private.admin_payment_confirmation_operations(empresa_id,created_at desc);
alter table private.admin_payment_confirmation_operations enable row level security;
revoke all on private.admin_payment_confirmation_operations from public,anon,authenticated;

create function public.admin_payment_operation(p_empresa uuid,p_previous_confirmation_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.admin_payment_confirmation_operations;
begin
  perform private.require_super_admin();
  perform 1 from public.empresas where id=p_empresa for update;
  if not found then raise exception 'Empresa não encontrada'; end if;
  if not exists(select 1 from public.assinaturas where empresa_id=p_empresa) then
    raise exception 'Assinatura não encontrada';
  end if;
  select * into op from private.admin_payment_confirmation_operations
    where empresa_id=p_empresa order by (status='completed'),created_at desc,id desc limit 1;
  -- Completed operations remain recoverable. Starting another requires an
  -- explicit acknowledgement of precisely the completed operation observed.
  if op.id is null or (op.status='completed' and p_previous_confirmation_id=op.confirmation_id) then
    insert into private.admin_payment_confirmation_operations(empresa_id,admin_user_id)
      values(p_empresa,auth.uid()) returning * into op;
  end if;
  return jsonb_build_object('confirmationId',op.confirmation_id,'status',op.status);
end $$;

create function public.admin_complete_payment_operation(p_empresa uuid,p_confirmation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.require_super_admin();
  perform 1 from public.empresas where id=p_empresa for update;
  if not exists(select 1 from public.pagamentos where empresa_id=p_empresa
    and provider='manual_pix' and external_payment_id='manual_pix:'||p_confirmation_id::text and status='APPROVED') then
    raise exception 'Pagamento ainda não reconciliado';
  end if;
  update private.admin_payment_confirmation_operations
    set status='completed',completed_at=coalesce(completed_at,now()),updated_at=now()
    where empresa_id=p_empresa and confirmation_id=p_confirmation_id;
  if not found then raise exception 'Operação não encontrada'; end if;
end $$;

create table private.os_photo_corrections (
  id uuid primary key default gen_random_uuid(),
  foto_id uuid not null,
  empresa_id uuid not null references public.empresas(id),
  ordem_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  action text not null check(action in ('replace','remove')),
  old_path text not null,
  new_path text unique,
  content_hash text,
  status text not null default 'pending' check(status in ('pending','applied','cancelled')),
  cleanup_completed boolean not null default false,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  foreign key(ordem_id,empresa_id) references public.ordens_servico(id,empresa_id)
);
create unique index photo_one_pending_correction on private.os_photo_corrections(foto_id) where status='pending';
alter table private.os_photo_corrections enable row level security;
revoke all on private.os_photo_corrections from public,anon,authenticated;

create function public.prepare_os_photo_correction(p_ordem uuid,p_foto uuid,p_action text,p_content_hash text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.fotos_os; op private.os_photo_corrections; oid uuid:=gen_random_uuid();
begin
  select * into f from public.fotos_os where id=p_foto and ordem_id=p_ordem for update;
  if auth.uid() is null or f.id is null or not private.can_access_company(f.empresa_id) then
    raise exception 'Foto não autorizada';
  end if;
  if p_action not in ('replace','remove') or p_action is null then raise exception 'Ação inválida'; end if;
  if p_action='replace' and coalesce(p_content_hash,'') !~ '^[0-9a-f]{64}$' then raise exception 'Imagem não identificada'; end if;
  select * into op from private.os_photo_corrections where foto_id=f.id and status='pending';
  if op.id is not null and op.actor_user_id<>auth.uid() then
    raise exception 'Há uma correção pendente desta foto';
  end if;
  if op.id is null then
    insert into private.os_photo_corrections(id,foto_id,empresa_id,ordem_id,actor_user_id,action,old_path,new_path,content_hash)
      values(oid,f.id,f.empresa_id,f.ordem_id,auth.uid(),p_action,f.caminho,
        case when p_action='replace' then f.empresa_id::text||'/'||f.ordem_id::text||'/equipe/'||oid::text||'.jpg' end,p_content_hash)
      returning * into op;
  end if;
  return jsonb_build_object('id',op.id,'path',op.new_path,'status',op.status,'action',op.action,'contentHash',op.content_hash,
    'uploaded',exists(select 1 from storage.objects where bucket_id='os-fotos' and name=op.new_path));
end $$;

create function public.apply_os_photo_correction(p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.os_photo_corrections; f public.fotos_os; meta jsonb;
begin
  select * into op from private.os_photo_corrections where id=p_operation for update;
  if auth.uid() is null or op.id is null or op.actor_user_id<>auth.uid() or not private.can_access_company(op.empresa_id) then
    raise exception 'Foto não autorizada';
  end if;
  if op.status='applied' then return jsonb_build_object('status','applied'); end if;
  if op.status<>'pending' then raise exception 'Correção encerrada'; end if;
  select * into f from public.fotos_os where id=op.foto_id and ordem_id=op.ordem_id and empresa_id=op.empresa_id for update;
  if f.id is null or f.caminho<>op.old_path then raise exception 'Foto alterada; recarregue a ordem'; end if;
  if op.action='replace' then
    select metadata into meta from storage.objects where bucket_id='os-fotos' and name=op.new_path;
    if not found or coalesce(meta->>'mimetype','') not in ('image/jpeg','image/png','image/webp')
      or coalesce((meta->>'size')::bigint,0) not between 1 and 6291456 then
      raise exception 'Imagem inválida ou acima de 6 MB';
    end if;
    update public.fotos_os set caminho=op.new_path,url='storage://os-fotos/'||op.new_path where id=f.id;
  else
    if exists(select 1 from public.empresas e join public.ordens_servico o on o.empresa_id=e.id
      where o.id=op.ordem_id and e.fotos_obrigatorias and (o.entrada_confirmada or o.status not in ('novo','cancelado')))
      and not exists(select 1 from public.fotos_os where ordem_id=op.ordem_id and id<>f.id) then
      raise exception 'Esta ordem exige pelo menos uma foto; substitua a imagem';
    end if;
    delete from public.fotos_os where id=f.id;
  end if;
  insert into public.historico_os(empresa_id,ordem_id,evento,detalhes,publico,usuario_id,autor)
    values(op.empresa_id,op.ordem_id,case when op.action='replace' then 'Foto substituída' else 'Foto removida' end,
      f.categoria||' · '||coalesce(f.descricao,'Sem ângulo')||' · Foto '||f.id::text,false,auth.uid(),'Equipe técnica');
  update private.os_photo_corrections set status='applied',applied_at=now() where id=op.id;
  return jsonb_build_object('status','applied');
end $$;

create function public.cancel_os_photo_correction(p_operation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare op private.os_photo_corrections;
begin
  select * into op from private.os_photo_corrections where id=p_operation for update;
  if auth.uid() is null or op.id is null or op.actor_user_id<>auth.uid() or not private.can_access_company(op.empresa_id) then
    raise exception 'Foto não autorizada';
  end if;
  if op.status='pending' then
    update private.os_photo_corrections set status='cancelled',cleanup_completed=(new_path is null) where id=op.id;
    op.status:='cancelled';
  end if;
  return jsonb_build_object('status',op.status);
end $$;

-- Tombstones prevent a cleaned path being attached again, including by legacy
-- registrar_foto. Replacement paths belong exclusively to the original photo.
create function private.guard_corrected_photo_path() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.os_photo_corrections c where
    (c.old_path=new.caminho and c.status='applied') or
    (c.new_path=new.caminho and (c.status='cancelled' or c.foto_id<>new.id))) then
    raise exception 'Caminho fotográfico encerrado ou reservado';
  end if;
  return new;
end $$;
create trigger guard_corrected_photo_path before insert or update of caminho on public.fotos_os
  for each row execute function private.guard_corrected_photo_path();

create function private.can_upload_correction_path(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select not exists(select 1 from private.os_photo_corrections c where
    (c.old_path=p_path and c.status='applied') or
    (c.new_path=p_path and (c.status<>'pending' or c.actor_user_id is distinct from auth.uid())))
$$;
create policy correction_upload_guard on storage.objects as restrictive for insert to anon,authenticated
  with check(bucket_id<>'os-fotos' or private.can_upload_correction_path(name));

create function private.can_cleanup_os_photo(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from private.os_photo_corrections c
    where c.actor_user_id=auth.uid() and private.can_access_company(c.empresa_id)
      and not c.cleanup_completed and
      ((c.status='applied' and c.old_path=p_path) or (c.status='cancelled' and c.new_path=p_path)))
    and not exists(select 1 from public.fotos_os where caminho=p_path)
$$;
create policy audited_photo_cleanup on storage.objects for delete to authenticated
  using(bucket_id='os-fotos' and private.can_cleanup_os_photo(name));

create function public.pending_os_photo_cleanup(p_ordem uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare eid uuid;
begin
  select empresa_id into eid from public.ordens_servico where id=p_ordem;
  if auth.uid() is null or eid is null or not private.can_access_company(eid) then raise exception 'Ordem não autorizada'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',id,'path',path)) from (
    select c.id,case when c.status='applied' then c.old_path else c.new_path end as path
      from private.os_photo_corrections c where c.ordem_id=p_ordem and c.actor_user_id=auth.uid()
        and c.status in ('applied','cancelled') and not c.cleanup_completed order by c.created_at limit 20
  ) q),'[]'::jsonb);
end $$;

create function public.complete_os_photo_cleanup(p_operation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare op private.os_photo_corrections; path text;
begin
  select * into op from private.os_photo_corrections where id=p_operation for update;
  if auth.uid() is null or op.id is null or op.actor_user_id<>auth.uid() or not private.can_access_company(op.empresa_id)
    or op.status not in ('applied','cancelled') then raise exception 'Limpeza não autorizada'; end if;
  path:=case when op.status='applied' then op.old_path else op.new_path end;
  if exists(select 1 from storage.objects where bucket_id='os-fotos' and name=path) then raise exception 'Arquivo ainda não removido'; end if;
  update private.os_photo_corrections set cleanup_completed=true where id=op.id;
end $$;

revoke all on function public.admin_payment_operation(uuid,uuid),public.admin_complete_payment_operation(uuid,uuid),
  public.prepare_os_photo_correction(uuid,uuid,text,text),public.apply_os_photo_correction(uuid),public.cancel_os_photo_correction(uuid),
  public.pending_os_photo_cleanup(uuid),public.complete_os_photo_cleanup(uuid),private.guard_corrected_photo_path(),private.can_cleanup_os_photo(text),private.can_upload_correction_path(text)
  from public,anon,authenticated;
grant execute on function public.admin_payment_operation(uuid,uuid),public.admin_complete_payment_operation(uuid,uuid),
  public.prepare_os_photo_correction(uuid,uuid,text,text),public.apply_os_photo_correction(uuid),public.cancel_os_photo_correction(uuid),
  public.pending_os_photo_cleanup(uuid),public.complete_os_photo_cleanup(uuid),private.can_cleanup_os_photo(text) to authenticated;
grant execute on function private.can_upload_correction_path(text) to anon,authenticated;

-- Keep the existing billing amounts/cycles; bind durable IDs to their company.
create or replace function public.admin_confirm_manual_payment(
  p_empresa uuid,
  p_confirmation_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  subscription public.assinaturas;
  existing_payment public.pagamentos;
  payment_id uuid;
  payment_amount numeric(12,2);
  payment_kind text;
  next_billing timestamptz;
  external_id text;
  normalized_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform private.require_super_admin();
  if exists (select 1 from private.admin_payment_confirmation_operations where confirmation_id=p_confirmation_id and empresa_id<>p_empresa) or exists (select 1 from public.pagamentos where provider='manual_pix' and external_payment_id='manual_pix:'||p_confirmation_id::text and empresa_id<>p_empresa) then
    raise exception 'Identificador pertence a outra empresa';
  end if;

  if p_confirmation_id is null then
    raise exception 'Identificador da confirmação não informado';
  end if;

  if length(coalesce(normalized_note, '')) > 1000 then
    raise exception 'A observação deve ter no máximo 1000 caracteres';
  end if;

  external_id := 'manual_pix:' || p_confirmation_id::text;

  select *
    into strict subscription
  from public.assinaturas
  where empresa_id = p_empresa
  for update;

  select *
    into existing_payment
  from public.pagamentos
  where provider = 'manual_pix'
    and external_payment_id = external_id
  limit 1;

  if found then
    return jsonb_build_object(
      'paymentId', existing_payment.id,
      'amount', existing_payment.valor,
      'kind', coalesce(existing_payment.payload->>'kind', 'manual'),
      'nextBillingDate', subscription.next_billing_date,
      'duplicate', true
    );
  end if;

  if exists (
    select 1
    from public.pagamentos p
    where p.assinatura_id = subscription.id
      and p.status = 'APPROVED'
  ) then
    payment_kind := 'monthly';
    payment_amount := 59.00;
    next_billing := case
      when subscription.next_billing_date is not null
       and subscription.next_billing_date > now()
        then subscription.next_billing_date + interval '1 month'
      else now() + interval '1 month'
    end;
  else
    payment_kind := 'initial';
    payment_amount := 44.99;
    next_billing := now() + interval '7 days';
  end if;

  insert into public.pagamentos(
    empresa_id,
    assinatura_id,
    provider,
    external_payment_id,
    valor,
    moeda,
    status,
    paid_at,
    payload
  )
  values(
    p_empresa,
    subscription.id,
    'manual_pix',
    external_id,
    payment_amount,
    'BRL',
    'APPROVED',
    now(),
    jsonb_build_object(
      'manual', true,
      'kind', payment_kind,
      'confirmedBy', auth.uid()
    )
  )
  returning id into payment_id;

  update public.assinaturas
  set status = 'ACTIVE',
      next_billing_date = next_billing,
      cancelled_at = null,
      atualizado_em = now()
  where id = subscription.id;

  update public.empresas
  set status = 'ACTIVE',
      scheduled_deletion_at = null,
      atualizado_em = now()
  where id = p_empresa;

  insert into public.admin_audit_logs(
    actor_user_id,
    action,
    empresa_id,
    motivo,
    detalhes
  )
  values(
    auth.uid(),
    'MANUAL_PAYMENT_APPROVED',
    p_empresa,
    coalesce(normalized_note, 'PIX confirmado manualmente'),
    jsonb_build_object(
      'paymentId', payment_id,
      'amount', payment_amount,
      'currency', 'BRL',
      'kind', payment_kind,
      'nextBillingDate', next_billing,
      'confirmationId', p_confirmation_id
    )
  );

  return jsonb_build_object(
    'paymentId', payment_id,
    'amount', payment_amount,
    'kind', payment_kind,
    'nextBillingDate', next_billing,
    'duplicate', false
  );
exception
  when no_data_found then
    raise exception 'Assinatura não encontrada';
end
$function$;

revoke all on function public.admin_confirm_manual_payment(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.admin_confirm_manual_payment(uuid, uuid, text)
to authenticated;

commit;
