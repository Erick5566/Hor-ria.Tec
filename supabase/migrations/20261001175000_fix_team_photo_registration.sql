-- Permite que qualquer membro ativo da assistência registre fotos que já
-- passaram pela mesma autorização usada pelo Storage.
begin;

create or replace function public.registrar_foto(
  p_caminho text,
  p_categoria text,
  p_descricao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  o public.ordens_servico;
  fid uuid;
begin
  select *
    into o
  from public.ordens_servico
  where id::text = split_part(p_caminho, '/', 2);

  if o.id is null or not private.pode_enviar_foto(p_caminho) then
    raise exception 'Upload não autorizado';
  end if;

  if not exists (
    select 1
    from storage.objects
    where bucket_id = 'os-fotos'
      and name = p_caminho
  ) then
    raise exception 'Envie a imagem antes de registrá-la';
  end if;

  select id
    into fid
  from public.fotos_os
  where caminho = p_caminho;

  if fid is not null then
    return fid;
  end if;

  if length(coalesce(p_descricao, '')) > 1000 then
    raise exception 'Observação muito longa';
  end if;

  insert into public.fotos_os(
    empresa_id,
    ordem_id,
    caminho,
    url,
    categoria,
    descricao,
    usuario_id,
    autor
  )
  values(
    o.empresa_id,
    o.id,
    p_caminho,
    'storage://os-fotos/' || p_caminho,
    p_categoria,
    p_descricao,
    auth.uid(),
    case when auth.uid() is null then 'Cliente' else 'Equipe técnica' end
  )
  returning id into fid;

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
    'Foto adicionada',
    p_categoria,
    auth.uid(),
    case when auth.uid() is null then 'Cliente' else 'Equipe técnica' end
  );

  return fid;
end
$function$;

revoke all on function public.registrar_foto(text, text, text)
from public, anon, authenticated;

grant execute on function public.registrar_foto(text, text, text)
to anon, authenticated;

commit;
