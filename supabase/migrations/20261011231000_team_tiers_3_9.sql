-- Horária: 3 funcionários no plano básico; 9 no Pro.
-- Somente Super Admin com MFA pode alterar o plano.
-- Chatbot Pro está previsto, não liberado. Nenhuma assinatura existente é migrada.
begin;

update public.planos
set recursos = recursos || '{"teamMax":3,"monthlyBRL":49,"chatbotStatus":"not_available"}'::jsonb,
    atualizado_em = now()
where codigo = 'HORARIA';

insert into public.planos(codigo,nome,ativo,recursos)
values('HORARIA_PRO','Horária Pro',true,'{"teamMax":9,"monthlyBRL":80,"chatbotStatus":"planned","allStableFeatures":true}'::jsonb)
on conflict(codigo) do update
set nome=excluded.nome, recursos=excluded.recursos, ativo=true, atualizado_em=now();

create or replace function private.company_team_plan(p_empresa uuid)
returns text language sql stable security definer set search_path='' as $function$
  select coalesce((select pl.codigo from public.assinaturas a
    join public.planos pl on pl.id=a.plano_id
    where a.empresa_id=p_empresa limit 1),'HORARIA')
$function$;

create or replace function private.team_seat_limit(p_empresa uuid)
returns integer language sql stable security definer set search_path='' as $function$
  select case when private.company_team_plan(p_empresa)='HORARIA_PRO' then 9 else 3 end
$function$;

revoke all on function private.company_team_plan(uuid),private.team_seat_limit(uuid) from public, anon, authenticated;

-- Serializa inscrições/reativações concorrentes e protege contra RPC/bypass de interface.
create or replace function private.enforce_team_seat_limit()
returns trigger language plpgsql security definer set search_path='' as $function$
declare
  v_count integer;
  v_limit integer;
begin
  if new.status <> 'ACTIVE' or new.role = 'OWNER'
     or (tg_op='UPDATE' and old.status='ACTIVE' and old.role<>'OWNER')
  then
    return new;
  end if;

  perform 1 from public.empresas where id=new.empresa_id for update;
  v_limit := private.team_seat_limit(new.empresa_id);
  select count(*) into v_count
  from public.empresa_membros m
  where m.empresa_id = new.empresa_id
    and m.status = 'ACTIVE'
    and m.role <> 'OWNER'
    and m.usuario_id <> new.usuario_id;

  if v_count >= v_limit then
    raise exception 'Limite de % funcionários atingido. Solicite mudança de plano.',v_limit;
  end if;

  return new;
end
$function$;

revoke all on function private.enforce_team_seat_limit() from public, anon, authenticated;
drop trigger if exists enforce_team_seat_limit on public.empresa_membros;
create trigger enforce_team_seat_limit
before insert or update of status,role on public.empresa_membros
for each row execute function private.enforce_team_seat_limit();

create or replace function public.admin_set_company_team_plan(
  p_empresa uuid,
  p_plan_code text,
  p_reason text default null
)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_plan uuid;
  v_old_code text;
  v_members integer;
  v_limit integer;
begin
  perform private.require_super_admin();
  if coalesce(auth.jwt()->>'aal','') <> 'aal2' then
    raise exception 'Autenticação MFA obrigatória para mudar o plano';
  end if;
  if p_plan_code not in ('HORARIA','HORARIA_PRO') then
    raise exception 'Plano não permitido';
  end if;
  select id into strict v_plan from public.planos where codigo=p_plan_code and ativo;
  perform 1 from public.empresas where id=p_empresa for update;
  select private.company_team_plan(p_empresa) into v_old_code;

  select count(*) into v_members from public.empresa_membros
  where empresa_id=p_empresa and status='ACTIVE' and role<>'OWNER';
  v_limit := case when p_plan_code='HORARIA_PRO' then 9 else 3 end;
  if v_members > v_limit then
    raise exception 'Desative funcionários excedentes antes de mudar para este plano';
  end if;
  update public.assinaturas set plano_id=v_plan, atualizado_em=now()
  where empresa_id=p_empresa;
  if not found then raise exception 'Assinatura não encontrada'; end if;
  insert into public.admin_audit_logs(actor_user_id,action,empresa_id,motivo,detalhes)
  values(auth.uid(),'CHANGE_TEAM_PLAN',p_empresa,nullif(trim(p_reason),''),
         jsonb_build_object('previousPlan',v_old_code,'nextPlan',p_plan_code,'seatsUsed',v_members));
  return jsonb_build_object('planCode',p_plan_code,'seatLimit',v_limit,'seatsUsed',v_members);
end
$function$;
revoke all on function public.admin_set_company_team_plan(uuid,text,text) from public,anon;
grant execute on function public.admin_set_company_team_plan(uuid,text,text) to authenticated;

create or replace function public.team_members_data()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_empresa uuid;
  v_actor_role text;
  v_result jsonb;
begin
  select m.empresa_id, m.role
    into v_empresa, v_actor_role
  from public.empresa_membros m
  where m.usuario_id = auth.uid()
    and m.status = 'ACTIVE'
    and m.role in ('OWNER','ADMIN')
    and private.company_operational(m.empresa_id)
  order by case m.role when 'OWNER' then 1 else 2 end
  limit 1;

  if v_empresa is null then
    raise exception 'Sem permissão para administrar a equipe';
  end if;

  select jsonb_build_object(
    'actorRole', v_actor_role,
    'seatLimit', private.team_seat_limit(v_empresa),
    'seatsUsed', (select count(*)::integer from public.empresa_membros m where m.empresa_id = v_empresa and m.status = 'ACTIVE' and m.role <> 'OWNER'),
    'planCode', private.company_team_plan(v_empresa),
    'chatbotStatus', 'planned',
    'items', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'userId', m.usuario_id,
          'name', coalesce(p.nome, ''),
          'email', coalesce(p.email, ''),
          'role', m.role,
          'status', m.status,
          'lastAccessAt', m.ultimo_acesso_em,
          'createdAt', m.criado_em,
          'isCurrentUser', m.usuario_id = auth.uid()
        )
        order by
          case m.role
            when 'OWNER' then 1
            when 'ADMIN' then 2
            when 'TECHNICIAN' then 3
            else 4
          end,
          coalesce(p.nome, p.email, m.usuario_id::text)
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.empresa_membros m
  left join public.perfis p on p.usuario_id = m.usuario_id
  where m.empresa_id = v_empresa;

  return v_result;
end
$function$;


create or replace function public.access_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with member as (
    select
      m.*,
      e.nome,
      e.slug,
      private.effective_company_status(e.id) as empresa_status,
      e.manutencao_ativa,
      e.mensagem_manutencao,
      e.feature_flags,
      e.scheduled_deletion_at
    from public.empresa_membros m
    join public.empresas e on e.id=m.empresa_id
    where m.usuario_id=auth.uid()
      and m.status='ACTIVE'
    order by case m.role when 'OWNER' then 1 when 'ADMIN' then 2 else 3 end
    limit 1
  ),
  config as (
    select * from public.configuracoes_plataforma where id
  )
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
    'billing',jsonb_build_object(
      'graceHours',config.billing_grace_hours,
      'initialAmount',case when pl.codigo = 'HORARIA_PRO' then 80.00 else config.initial_payment_amount end,
      'planCode',coalesce(pl.codigo,'HORARIA'),
      'monthlyAmount',case when pl.codigo = 'HORARIA_PRO' then 80.00 else config.monthly_payment_amount end,
      'hasApprovedPayment',case
        when a.id is null then false
        else exists(
          select 1 from public.pagamentos pg
          where pg.assinatura_id=a.id and pg.status='APPROVED'
        )
      end
    ),
    'company',case
      when member.empresa_id is null then null
      else jsonb_build_object(
        'id',member.empresa_id,
        'name',member.nome,
        'slug',member.slug,
        'role',member.role,
        'status',member.empresa_status,
        'maintenance',member.manutencao_ativa,
        'maintenanceMessage',member.mensagem_manutencao,
        'scheduledDeletionAt',member.scheduled_deletion_at,
        'featureFlags',config.feature_flags || member.feature_flags
      )
    end,
    'subscription',case
      when a.id is null then null
      else jsonb_build_object(
        'id',a.id,
        'status',case
          when member.empresa_status in ('PAST_DUE','SUSPENDED','CANCELED') then member.empresa_status
          else a.status
        end,
        'startedAt',a.started_at,
        'trialEndsAt',a.trial_ends_at,
        'nextBillingDate',a.next_billing_date,
        'cancelledAt',a.cancelled_at
      )
    end
  )
  from config
  left join public.perfis p on p.usuario_id=auth.uid()
  left join member on true
  left join public.assinaturas a on a.empresa_id=member.empresa_id
  left join public.planos pl on pl.id=a.plano_id
$$;


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
  initial_amount numeric(12,2);
  monthly_amount numeric(12,2);
  payment_kind text;
  v_plan_code text;
  next_billing timestamptz;
  external_id text;
  normalized_note text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform private.require_super_admin();

  if exists (
    select 1
    from private.admin_payment_confirmation_operations
    where confirmation_id = p_confirmation_id
      and empresa_id <> p_empresa
  ) or exists (
    select 1
    from public.pagamentos
    where provider = 'manual_pix'
      and external_payment_id = 'manual_pix:' || p_confirmation_id::text
      and empresa_id <> p_empresa
  ) then
    raise exception 'Identificador pertence a outra empresa';
  end if;

  if p_confirmation_id is null then
    raise exception 'Identificador da confirmação não informado';
  end if;

  if length(coalesce(normalized_note, '')) > 1000 then
    raise exception 'A observação deve ter no máximo 1000 caracteres';
  end if;

  select
    c.initial_payment_amount,
    c.monthly_payment_amount
  into strict
    initial_amount,
    monthly_amount
  from public.configuracoes_plataforma c
  where c.id;

  v_plan_code := private.company_team_plan(p_empresa);
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
    payment_amount := case when v_plan_code = 'HORARIA_PRO' then 80.00 else monthly_amount end;
    next_billing := case
      when subscription.next_billing_date is not null
       and subscription.next_billing_date > now()
        then subscription.next_billing_date + interval '1 month'
      else now() + interval '1 month'
    end;
  else
    payment_kind := 'initial';
    payment_amount := case when v_plan_code = 'HORARIA_PRO' then 80.00 else initial_amount end;
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
      'planCode', v_plan_code,
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
    raise exception 'Assinatura ou configuração de cobrança não encontrada';
end
$function$;



-- O estoque completo é privado para OWNER/ADMIN, inclusive por API.
-- Técnicos não podem recuperar preços/custos chamando o catálogo diretamente.
create or replace function public.catalog_page(
  p_stock boolean default false,
  p_page integer default 1,
  p_page_size integer default 30,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_empresa uuid;
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_size integer := least(greatest(coalesce(p_page_size, 30), 10), 100);
  v_offset integer;
begin
  select m.empresa_id
    into v_empresa
  from public.empresa_membros m
  where m.usuario_id = auth.uid()
    and m.status = 'ACTIVE'
    and private.company_operational(m.empresa_id)
    and (
      not p_stock
      or m.role in ('OWNER','ADMIN')
    )
  order by case m.role
    when 'OWNER' then 1
    when 'ADMIN' then 2
    when 'TECHNICIAN' then 3
    else 4
  end
  limit 1;

  if v_empresa is null then
    return null;
  end if;

  v_offset := (v_page - 1) * v_size;

  if p_stock then
    return (
      with filtered as materialized (
        select p.*
        from public.pecas p
        where p.empresa_id = v_empresa
          and private.feature_enabled(v_empresa, 'stockEnabled')
          and (
            coalesce(trim(p_search), '') = '' or
            concat_ws(' ', p.nome, p.compatibilidade, p.categoria)
              ilike '%' || trim(p_search) || '%'
          )
      ),
      paged as (
        select *
        from filtered
        order by nome, id
        limit v_size
        offset v_offset
      )
      select jsonb_build_object(
        'page', v_page,
        'pageSize', v_size,
        'total', (select count(*)::int from filtered),
        'items', coalesce(
          (select jsonb_agg(to_jsonb(p) order by p.nome, p.id) from paged p),
          '[]'::jsonb
        ),
        'metrics', jsonb_build_object(
          'total', (
            select count(*)::int from public.pecas p
            where p.empresa_id = v_empresa
          ),
          'active', (
            select count(*)::int
            from public.pecas p
            where p.empresa_id = v_empresa and p.quantidade > 0
          ),
          'averagePrice', coalesce((
            select avg(p.preco) from public.pecas p
            where p.empresa_id = v_empresa
          ), 0),
          'secondary', (
            select count(distinct nullif(trim(p.compatibilidade), ''))::int
            from public.pecas p
            where p.empresa_id = v_empresa
          )
        )
      )
    );
  end if;

  return (
    with filtered as materialized (
      select s.*
      from public.servicos s
      where s.empresa_id = v_empresa
        and (
          coalesce(trim(p_search), '') = '' or
          concat_ws(' ', s.nome, s.categoria, s.descricao)
            ilike '%' || trim(p_search) || '%'
        )
    ),
    paged as (
      select *
      from filtered
      order by ativo desc, nome, id
      limit v_size
      offset v_offset
    )
    select jsonb_build_object(
      'page', v_page,
      'pageSize', v_size,
      'total', (select count(*)::int from filtered),
      'items', coalesce(
        (select jsonb_agg(to_jsonb(s) order by s.ativo desc, s.nome, s.id) from paged s),
        '[]'::jsonb
      ),
      'metrics', jsonb_build_object(
        'total', (
          select count(*)::int from public.servicos s where s.empresa_id = v_empresa
        ),
        'active', (
          select count(*)::int
          from public.servicos s
          where s.empresa_id = v_empresa and s.ativo
        ),
        'averagePrice', coalesce((
          select avg(s.preco) from public.servicos s where s.empresa_id = v_empresa
        ), 0),
        'secondary', coalesce((
          select round(avg(s.duracao))::int
          from public.servicos s
          where s.empresa_id = v_empresa
        ), 0)
      )
    )
  );
end;
$function$;



drop policy if exists pecas_operational_select on public.pecas;
drop policy if exists pecas_operational_insert on public.pecas;
drop policy if exists pecas_operational_update on public.pecas;

create policy pecas_manager_select on public.pecas for select to authenticated
using(private.can_manage_company(empresa_id) and private.feature_enabled(empresa_id,'stockEnabled'));
create policy pecas_manager_insert on public.pecas for insert to authenticated
with check(private.can_manage_company(empresa_id) and private.feature_enabled(empresa_id,'stockEnabled'));
create policy pecas_manager_update on public.pecas for update to authenticated
using(private.can_manage_company(empresa_id) and private.feature_enabled(empresa_id,'stockEnabled'))
with check(private.can_manage_company(empresa_id) and private.feature_enabled(empresa_id,'stockEnabled'));


-- Técnicos continuam registrando peças em OS, sem consultar custos, margens
-- ou fazer movimentações administrativas de estoque por fora da OS.
create or replace function public.applied_parts_options(p_order uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_empresa uuid;
  v_role text;
begin
  select m.empresa_id,m.role
    into v_empresa,v_role
  from public.empresa_membros m
  where m.usuario_id = auth.uid()
    and m.status = 'ACTIVE'
    and m.role in ('OWNER','ADMIN','TECHNICIAN')
    and private.company_operational(m.empresa_id)
  order by case m.role
    when 'OWNER' then 1
    when 'ADMIN' then 2
    else 3
  end
  limit 1;

  if v_empresa is null then
    raise exception 'Sem permissão para consultar peças aplicadas';
  end if;

  if not exists (
    select 1
    from public.ordens_servico o
    where o.id = p_order
      and o.empresa_id = v_empresa
  ) then
    raise exception 'Ordem inválida';
  end if;

  return jsonb_build_object(
    'applied', coalesce((
      select jsonb_agg(case when v_role='TECHNICIAN' then to_jsonb(a) - 'custo_unitario' - 'valor_venda_unitario' - 'mao_obra' else to_jsonb(a) end order by a.criado_em desc)
      from public.pecas_aplicadas a
      where a.empresa_id = v_empresa
        and a.ordem_id = p_order
    ), '[]'::jsonb),
    'stock', case
      when private.feature_enabled(v_empresa, 'stockEnabled') then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'nome', p.nome,
            'quantidade', p.quantidade,
            'custo', case when v_role='TECHNICIAN' then null else p.custo end,
            'preco', case when v_role='TECHNICIAN' then null else p.preco end
          )
          order by p.nome
        )
        from public.pecas p
        where p.empresa_id = v_empresa
          and p.ativo
          and p.quantidade > 0
      ), '[]'::jsonb)
      else '[]'::jsonb
    end
  );
end
$function$;


create or replace function public.registrar_peca_aplicada_valores(
  p_ordem uuid,
  p_nome text,
  p_quantidade integer,
  p_peca uuid default null,
  p_custo_unitario numeric default null,
  p_valor_venda_unitario numeric default null,
  p_mao_obra numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  o public.ordens_servico;
  p public.pecas;
  id_novo uuid;
  nome_final text;
  custo_final numeric;
  venda_final numeric;
  v_manager boolean;
begin
  select *
    into strict o
  from public.ordens_servico
  where id = p_ordem
  for update;

  if not private.has_company_role(
    o.empresa_id,
    array['OWNER','ADMIN','TECHNICIAN']
  ) or not private.company_operational(o.empresa_id) then
    raise exception 'Ordem não autorizada';
  end if;

  if o.status in ('finalizado','cancelado') then
    raise exception 'Ordem encerrada';
  end if;

  if p_quantidade is null or p_quantidade not between 1 and 1000 then
    raise exception 'Quantidade inválida';
  end if;

  if coalesce(p_mao_obra, 0) < 0 then
    raise exception 'Mão de obra inválida';
  end if;

  v_manager := private.can_manage_company(o.empresa_id);
  nome_final := trim(coalesce(p_nome, ''));
  custo_final := coalesce(p_custo_unitario, 0);
  venda_final := coalesce(p_valor_venda_unitario, 0);

  if p_peca is not null then
    if not private.feature_enabled(o.empresa_id, 'stockEnabled') then
      raise exception 'Estoque indisponível';
    end if;

    select *
      into strict p
    from public.pecas
    where id = p_peca
      and empresa_id = o.empresa_id
      and ativo
    for update;

    if p.quantidade < p_quantidade then
      raise exception 'Quantidade indisponível no estoque';
    end if;

    if length(nome_final) < 2 then
      nome_final := p.nome;
    end if;

    custo_final := coalesce(p_custo_unitario, p.custo);
    venda_final := coalesce(p_valor_venda_unitario, p.preco);

    if not v_manager then
      custo_final := p.custo;
      venda_final := p.preco;
    end if;
    perform set_config('horaria.ordem_estoque', o.id::text, true);
    perform set_config('horaria.motivo_estoque', 'Uso na OS #' || o.numero, true);
    update public.pecas
    set quantidade = quantidade - p_quantidade
    where id = p.id;
    perform set_config('horaria.ordem_estoque', '', true);
    perform set_config('horaria.motivo_estoque', '', true);
  end if;

  if not v_manager and p_peca is null then
    custo_final := 0;
    venda_final := 0;
  end if;

  if length(nome_final) not between 2 and 200
     or custo_final < 0
     or venda_final < 0 then
    raise exception 'Valores da peça inválidos';
  end if;

  insert into public.pecas_aplicadas(
    empresa_id,
    ordem_id,
    peca_id,
    nome,
    quantidade,
    custo_unitario,
    valor_venda_unitario,
    mao_obra
  )
  values(
    o.empresa_id,
    o.id,
    p_peca,
    nome_final,
    p_quantidade,
    custo_final,
    venda_final,
    case when v_manager then coalesce(p_mao_obra,0) else 0 end
  )
  returning id into id_novo;

  if p_peca is null then
    insert into public.historico_os(
      empresa_id,
      ordem_id,
      evento,
      detalhes,
      usuario_id,
      autor
    )
    values(
      o.empresa_id,
      o.id,
      'Peça aplicada',
      nome_final || ' · ' || p_quantidade || ' unidade(s)',
      auth.uid(),
      'Equipe técnica'
    );
  end if;

  return id_novo;
end
$function$;


create or replace function public.movimentar_estoque(
  p_peca uuid,
  p_quantidade integer,
  p_motivo text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  p public.pecas;
  nova_quantidade integer;
begin
  select *
    into strict p
  from public.pecas
  where id = p_peca
  for update;

  if not private.has_company_role(
    p.empresa_id,
    array['OWNER','ADMIN']
  ) or not private.company_operational(p.empresa_id)
    or not private.feature_enabled(p.empresa_id, 'stockEnabled')
  then
    raise exception 'Item não autorizado';
  end if;

  if p_quantidade is null or p_quantidade = 0 or abs(p_quantidade) > 100000 then
    raise exception 'Quantidade inválida';
  end if;

  if length(trim(coalesce(p_motivo,''))) not between 2 and 200 then
    raise exception 'Informe o motivo da movimentação';
  end if;

  nova_quantidade := p.quantidade + p_quantidade;
  if nova_quantidade < 0 then
    raise exception 'Estoque insuficiente. Disponível: %', p.quantidade;
  end if;

  perform set_config('horaria.motivo_estoque', trim(p_motivo), true);
  update public.pecas set quantidade = nova_quantidade where id = p.id;
  perform set_config('horaria.motivo_estoque', '', true);

  return nova_quantidade;
end
$function$;


drop policy if exists movimentos_estoque_operational_select on public.movimentos_estoque;
create policy movimentos_estoque_manager_select on public.movimentos_estoque for select to authenticated
using(private.can_manage_company(empresa_id) and private.feature_enabled(empresa_id,'stockEnabled'));
drop policy if exists pecas_aplicadas_technical_select on public.pecas_aplicadas;
create policy pecas_aplicadas_manager_select on public.pecas_aplicadas for select to authenticated
using(private.can_manage_company(empresa_id) and private.company_operational(empresa_id));

commit;
