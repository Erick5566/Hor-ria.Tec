begin;

alter table public.fiscal_settings
  drop constraint if exists fiscal_settings_cnpj_check;

alter table public.fiscal_settings
  add constraint fiscal_settings_cnpj_check
  check (
    cnpj is null
    or regexp_replace(cnpj, '[^0-9]', '', 'g') ~ '^[0-9]{14}$'
  );

comment on constraint fiscal_settings_cnpj_check on public.fiscal_settings is
  'Aceita CNPJ com ou sem máscara, desde que contenha exatamente 14 dígitos.';

commit;
