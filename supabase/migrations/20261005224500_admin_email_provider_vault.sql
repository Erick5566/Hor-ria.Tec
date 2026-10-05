create or replace function public.admin_email_provider_credentials()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  resend_key text;
  sender text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return jsonb_build_object(
      'resendApiKey', null,
      'from', 'Horária <onboarding@resend.dev>'
    );
  end if;

  execute $sql$
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'horaria_resend_api_key'
    order by created_at desc
    limit 1
  $sql$ into resend_key;

  execute $sql$
    select decrypted_secret
    from vault.decrypted_secrets
    where name = 'horaria_admin_email_from'
    order by created_at desc
    limit 1
  $sql$ into sender;

  return jsonb_build_object(
    'resendApiKey', resend_key,
    'from', coalesce(nullif(trim(sender), ''), 'Horária <onboarding@resend.dev>')
  );
end
$function$;

revoke all on function public.admin_email_provider_credentials()
from public, anon, authenticated;
grant execute on function public.admin_email_provider_credentials()
to service_role;
