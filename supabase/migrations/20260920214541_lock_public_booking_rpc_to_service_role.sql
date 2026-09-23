-- Restored verbatim from the existing Supabase migration history.

revoke execute on function public.solicitar_reparo(
  text, jsonb, jsonb, text, uuid, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.solicitar_reparo(
  text, jsonb, jsonb, text, uuid, timestamptz, text
) to service_role;


