-- Modelos de mensagens por assistência, com isolamento por empresa.
-- A migração é aditiva e não realiza qualquer envio por si só.
begin;

create table public.mensagens_whatsapp_templates (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo ~ '^[a-z_]{3,40}$'),
  conteudo text not null check (
    length(trim(conteudo)) between 1 and 1600
    and regexp_replace(
      conteudo,
      '\{(nome_cliente|aparelho|link_orcamento|link_acompanhamento|nome_loja)\}',
      '', 'g'
    ) !~ '\{[^{}]*\}'
  ),
  atualizado_em timestamptz not null default now(),
  primary key (empresa_id, tipo)
);

alter table public.mensagens_whatsapp_templates enable row level security;
revoke all on public.mensagens_whatsapp_templates from public, anon, authenticated;
grant select, insert, update on public.mensagens_whatsapp_templates to authenticated;

create policy whatsapp_templates_select
on public.mensagens_whatsapp_templates
for select to authenticated
using (private.can_access_company(empresa_id));

create policy whatsapp_templates_insert
on public.mensagens_whatsapp_templates
for insert to authenticated
with check (
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

create policy whatsapp_templates_update
on public.mensagens_whatsapp_templates
for update to authenticated
using (
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
)
with check (
  private.can_manage_company(empresa_id)
  and private.company_operational(empresa_id)
);

create function private.render_whatsapp_template(
  p_empresa uuid, p_tipo text, p_cliente text,
  p_aparelho text, p_token uuid
) returns text language plpgsql stable security invoker
set search_path = '' as $function$
declare
  v_conteudo text;
  v_loja text;
  v_link text;
begin
  select t.conteudo into v_conteudo
  from public.mensagens_whatsapp_templates t
  where t.empresa_id=p_empresa and t.tipo=p_tipo;

  if v_conteudo is null then
    if p_tipo='orcamento' then
      v_conteudo := 'Olá, {nome_cliente}! 👋 O orçamento do seu {aparelho} já está pronto. Acesse o link para visualizar os detalhes e aprovar: {link_orcamento}';
    elsif p_tipo='pronto_retirada' then
      v_conteudo := 'Olá, {nome_cliente}! ✅ Seu {aparelho} já está finalizado e pronto para retirada. Você pode vir buscá-lo quando quiser! Acompanhe por aqui: {link_acompanhamento}';
    else
      raise exception 'Tipo de mensagem não configurado';
    end if;
  end if;

  select coalesce(nullif(trim(e.nome),''),'assistência técnica')
    into v_loja from public.empresas e where e.id=p_empresa;
  v_link := case when p_token is null then 'link indisponível'
     else 'https://horaria.site/acompanhar/'||p_token::text end;

  return replace(
    replace(
      replace(
        replace(
          replace(v_conteudo, '{nome_cliente}',coalesce(nullif(trim(p_cliente),''),'cliente')),
          '{aparelho}',coalesce(nullif(trim(p_aparelho),''),'aparelho')
        ),
        '{link_orcamento}',v_link
      ),
      '{link_acompanhamento}',v_link
    ),
    '{nome_loja}',coalesce(v_loja,'assistência técnica')
  );
end $function$;

revoke all on function private.render_whatsapp_template(uuid,text,text,text,uuid)
  from public,anon,authenticated;

-- Preserva idempotência, payload e as regras atuais dos avisos de orçamento.
create or replace function private.enfileirar_notificacao_orcamento()
returns trigger language plpgsql security definer
set search_path = '' as $function$
declare
  o public.ordens_servico;
  c public.clientes;
  eq public.equipamentos;
begin
  if new.status='enviado' and (TG_OP='INSERT' or old.status is distinct from new.status) then
    select * into strict o from public.ordens_servico where id=new.ordem_id;
    select * into strict c from public.clientes where id=o.cliente_id and empresa_id=o.empresa_id;
    select * into strict eq from public.equipamentos where id=o.equipamento_id and empresa_id=o.empresa_id;
    insert into public.notificacoes (
      empresa_id,ordem_id,orcamento_id,evento,chave_idempotencia,destinatario,mensagem,payload
    ) values (
      new.empresa_id,new.ordem_id,new.id,'orcamento_enviado',
      'orcamento:'||new.id||':enviado',c.whatsapp,
      private.render_whatsapp_template(
        new.empresa_id,'orcamento',c.nome,
        trim(concat_ws(' ',nullif(eq.marca,''),eq.modelo)),
        o.token_acompanhamento
      ),
      jsonb_build_object(
        'token',o.token_acompanhamento,'numero',o.numero,'total',new.total,
        'cliente',c.nome,
        'equipamento',trim(concat_ws(' ',nullif(eq.marca,''),eq.modelo))
      )
    ) on conflict(chave_idempotencia) do nothing;
  end if;
  return new;
end $function$;

-- Preserva o opt-in, plano Plus e canal oficial habilitado na retirada.
create or replace function private.enfileirar_notificacao_ordem()
returns trigger language plpgsql security definer
set search_path = '' as $function$
declare
  c public.clientes;
  eq public.equipamentos;
begin
  if new.status <> 'pronto_retirada'
    or old.status is not distinct from new.status
    or new.aviso_whatsapp_autorizado is not true then
    return new;
  end if;
  if not private.feature_enabled(new.empresa_id,'whatsappEnabled')
    or not exists (
      select 1 from public.assinaturas a
      join public.planos p on p.id=a.plano_id
      where a.empresa_id=new.empresa_id
        and a.status in ('TRIAL','ACTIVE') and p.codigo='HORARIA_PRO'
    ) then
    return new;
  end if;

  select * into c from public.clientes
    where id=new.cliente_id and empresa_id=new.empresa_id;
  select * into eq from public.equipamentos
    where id=new.equipamento_id and empresa_id=new.empresa_id;
  if c.id is null or eq.id is null then return new; end if;

  insert into public.notificacoes (
    empresa_id,ordem_id,evento,chave_idempotencia,destinatario,mensagem,payload
  ) values (
    new.empresa_id,new.id,'pronto_retirada',
    'ordem:'||new.id||':pronto_retirada',c.whatsapp,
    private.render_whatsapp_template(
      new.empresa_id,'pronto_retirada',c.nome,
      trim(concat_ws(' ',nullif(eq.marca,''),eq.modelo)),new.token_acompanhamento
    ),
    jsonb_build_object(
      'token',new.token_acompanhamento,'numero',new.numero,'cliente',c.nome,
      'equipamento',trim(concat_ws(' ',nullif(eq.marca,''),eq.modelo)),
      'readyConsent',true
    )
  ) on conflict(chave_idempotencia) do nothing;
  return new;
end $function$;

commit;
