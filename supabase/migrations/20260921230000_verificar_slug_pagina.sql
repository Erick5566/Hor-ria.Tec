create or replace function public.verificar_slug_pagina(
  p_slug text,
  p_empresa uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_slug text := lower(trim(coalesce(p_slug, '')));
  v_available boolean;
  v_suggestion text;
begin
  if auth.uid() is null or not private.can_manage_company(p_empresa) then
    raise exception 'Empresa não autorizada';
  end if;

  if
    v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    or v_slug = any(array[
      'painel','agendar','acompanhar','api','admin','login','dashboard',
      'suporte','horaria','entrar','cadastro','manutencao','conta-bloqueada'
    ])
  then
    return jsonb_build_object(
      'disponivel', false,
      'sugestao', null,
      'motivo', 'invalido'
    );
  end if;

  select not exists(
    select 1
    from public.empresas e
    where e.slug = v_slug
      and e.id <> p_empresa
  )
  into v_available;

  if v_available then
    return jsonb_build_object(
      'disponivel', true,
      'sugestao', null,
      'motivo', null
    );
  end if;

  select candidate
  into v_suggestion
  from (
    select v_slug || '-' || suffix::text as candidate
    from generate_series(2, 99) as suffix
  ) options
  where not exists(
    select 1
    from public.empresas e
    where e.slug = options.candidate
  )
  limit 1;

  return jsonb_build_object(
    'disponivel', false,
    'sugestao', v_suggestion,
    'motivo', 'em_uso'
  );
end
$function$;

revoke all on function public.verificar_slug_pagina(text, uuid) from public, anon;
grant execute on function public.verificar_slug_pagina(text, uuid) to authenticated;
