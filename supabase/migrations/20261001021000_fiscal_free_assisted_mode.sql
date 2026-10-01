begin;

alter table public.fiscal_settings
  drop constraint if exists fiscal_settings_provider_check;

alter table public.fiscal_settings
  alter column provider set default 'emissor_nacional_web';

alter table public.fiscal_settings
  add constraint fiscal_settings_provider_check
  check (provider in ('emissor_nacional_web','focusnfe'));

alter table public.fiscal_documents
  drop constraint if exists fiscal_documents_provider_check,
  drop constraint if exists fiscal_documents_status_check;

alter table public.fiscal_documents
  alter column provider set default 'emissor_nacional_web';

alter table public.fiscal_documents
  add constraint fiscal_documents_provider_check
  check (provider in ('emissor_nacional_web','focusnfe'));

alter table public.fiscal_documents
  add constraint fiscal_documents_status_check
  check (status in (
    'preparando',
    'pronto_para_emitir',
    'emitida_manual',
    'processando_autorizacao',
    'autorizado',
    'erro_autorizacao',
    'cancelado',
    'rejeitado'
  ));

comment on column public.fiscal_documents.status is
  'Fluxo fiscal do Horária: rascunho assistido, emissão registrada manualmente ou integração automática futura.';

commit;