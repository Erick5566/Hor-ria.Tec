begin;

alter table public.fiscal_settings
  add column if not exists dados_confirmados boolean not null default false,
  add column if not exists configuracao_confirmada boolean not null default false;

comment on column public.fiscal_settings.dados_confirmados is
  'Indica que o usuário concluiu a etapa de dados básicos do onboarding fiscal.';
comment on column public.fiscal_settings.configuracao_confirmada is
  'Indica que o usuário concluiu a etapa de configuração fiscal do onboarding.';

commit;