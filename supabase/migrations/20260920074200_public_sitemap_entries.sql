create or replace function public.public_sitemap_entries()
returns table(slug text, atualizado_em timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select e.slug, e.atualizado_em
  from public.empresas e
  where private.public_company_available(e.id)
  order by e.slug
$$;

grant execute on function public.public_sitemap_entries() to anon, authenticated;
