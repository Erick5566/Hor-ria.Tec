begin;

create table public.fiscal_settings (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  provider text not null default 'focusnfe' check (provider in ('focusnfe')),
  ambiente text not null default 'homologacao' check (ambiente in ('homologacao','producao')),
  modelo text not null default 'nfsen' check (modelo in ('nfsen')),
  ativo boolean not null default false,
  cnpj text,
  razao_social text,
  inscricao_municipal text,
  codigo_municipio text,
  codigo_tributacao_nacional_iss text,
  codigo_opcao_simples_nacional text,
  regime_especial_tributacao text,
  tributacao_iss numeric(6,2),
  serie_dps integer not null default 1 check (serie_dps > 0),
  proximo_numero_dps bigint not null default 1 check (proximo_numero_dps > 0),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users(id),
  check (cnpj is null or regexp_replace(cnpj,'\\D','','g') ~ '^[0-9]{14}$'),
  check (codigo_municipio is null or codigo_municipio ~ '^[0-9]{7}$')
);

create table public.fiscal_documents (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ordem_id uuid not null,
  tipo text not null default 'nfsen' check (tipo in ('nfsen')),
  ambiente text not null check (ambiente in ('homologacao','producao')),
  provider text not null default 'focusnfe' check (provider in ('focusnfe')),
  provider_ref text not null,
  numero_dps bigint,
  serie_dps integer,
  status text not null default 'preparando' check (status in (
    'preparando',
    'processando_autorizacao',
    'autorizado',
    'erro_autorizacao',
    'cancelado',
    'rejeitado'
  )),
  valor numeric(12,2) not null check (valor > 0),
  numero text,
  chave text,
  protocolo text,
  pdf_url text,
  xml_url text,
  mensagem text,
  provider_response jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users(id),
  unique (empresa_id, provider_ref),
  foreign key (ordem_id, empresa_id) references public.ordens_servico(id, empresa_id)
);

create index fiscal_documents_empresa_created_idx
  on public.fiscal_documents(empresa_id, criado_em desc);
create index fiscal_documents_order_idx
  on public.fiscal_documents(ordem_id, empresa_id);
create index fiscal_documents_status_idx
  on public.fiscal_documents(empresa_id, status);

alter table public.fiscal_settings enable row level security;
alter table public.fiscal_documents enable row level security;

revoke all on public.fiscal_settings, public.fiscal_documents from anon, authenticated;
grant select on public.fiscal_settings, public.fiscal_documents to authenticated;
grant insert, update on public.fiscal_settings, public.fiscal_documents to authenticated;

create policy fiscal_settings_member_select
  on public.fiscal_settings
  for select to authenticated
  using (private.can_access_company(empresa_id));

create policy fiscal_settings_manager_insert
  on public.fiscal_settings
  for insert to authenticated
  with check (private.can_manage_company(empresa_id));

create policy fiscal_settings_manager_update
  on public.fiscal_settings
  for update to authenticated
  using (private.can_manage_company(empresa_id))
  with check (private.can_manage_company(empresa_id));

create policy fiscal_documents_member_select
  on public.fiscal_documents
  for select to authenticated
  using (private.can_access_company(empresa_id));

create policy fiscal_documents_manager_insert
  on public.fiscal_documents
  for insert to authenticated
  with check (private.can_manage_company(empresa_id));

create policy fiscal_documents_manager_update
  on public.fiscal_documents
  for update to authenticated
  using (private.can_manage_company(empresa_id))
  with check (private.can_manage_company(empresa_id));

create trigger enforce_company_write
  before insert or update or delete on public.fiscal_settings
  for each row execute function private.enforce_operational_company_write();

create trigger enforce_company_write
  before insert or update or delete on public.fiscal_documents
  for each row execute function private.enforce_operational_company_write();

create or replace function public.reservar_numero_dps(p_empresa uuid)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare numero bigint;
begin
  if not private.can_manage_company(p_empresa) then
    raise exception 'Apenas gestores podem emitir documentos fiscais';
  end if;

  update public.fiscal_settings
     set proximo_numero_dps = proximo_numero_dps + 1,
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where empresa_id = p_empresa
     and ativo
  returning proximo_numero_dps - 1 into numero;

  if numero is null then
    raise exception 'Configuração fiscal inativa';
  end if;

  return numero;
end
$$;

revoke all on function public.reservar_numero_dps(uuid) from public, anon, authenticated;
grant execute on function public.reservar_numero_dps(uuid) to authenticated;

comment on table public.fiscal_settings is
  'Configuração fiscal por assistência. Segredos do provedor não são armazenados aqui.';
comment on table public.fiscal_documents is
  'Documentos fiscais emitidos pela integração do Horária.';

commit;