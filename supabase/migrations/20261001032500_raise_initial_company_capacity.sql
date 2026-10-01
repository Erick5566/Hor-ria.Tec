begin;

update public.configuracoes_plataforma
set max_companies = greatest(max_companies, 15)
where id;

commit;