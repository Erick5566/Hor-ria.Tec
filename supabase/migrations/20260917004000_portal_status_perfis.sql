begin;

update public.perfis p set nome=coalesce(
 nullif(trim(to_jsonb(u)->'raw_user_meta_data'->>'responsible_name'),''),
 nullif(trim(to_jsonb(u)->'raw_user_meta_data'->>'full_name'),''),
 nullif(split_part(coalesce(to_jsonb(u)->>'email',''),'@',1),'')
)
from auth.users u where u.id=p.usuario_id and p.nome is null;

create or replace function public.public_company_status(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'exists',true,'name',e.nome,
  'state',case when c.manutencao_global or e.manutencao_ativa then 'MAINTENANCE' when e.status not in ('TRIAL','ACTIVE','PAST_DUE') then 'UNAVAILABLE' else 'AVAILABLE' end,
  'message',case when e.manutencao_ativa then e.mensagem_manutencao when c.manutencao_global then c.mensagem_manutencao else null end
 ) from public.empresas e cross join public.configuracoes_plataforma c where e.slug=p_slug and c.id
$$;

revoke all on function public.public_company_status(text) from public,anon,authenticated;
grant execute on function public.public_company_status(text) to anon,authenticated;

commit;
