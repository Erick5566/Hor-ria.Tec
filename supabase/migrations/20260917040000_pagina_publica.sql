begin;

alter table public.empresas
  add column slogan text,
  add column google_maps_url text,
  add column google_business_url text;

alter table public.empresas drop constraint if exists slug_rotas_reservadas;
alter table public.empresas add constraint slug_rotas_reservadas check (
  slug not in ('painel','agendar','acompanhar','api','admin','login','dashboard','suporte','horaria','entrar','cadastro','manutencao','conta-bloqueada')
);

create table public.pagina_publica_config (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  headline text not null default 'Assistência técnica especializada' check(length(headline) between 2 and 120),
  subheadline text not null default 'Reparos organizados, acompanhamento online e atendimento com garantia.' check(length(subheadline) between 2 and 300),
  botao_primario text not null default 'Agendar atendimento' check(length(botao_primario) between 2 and 40),
  botao_secundario text not null default 'Acompanhar meu reparo' check(length(botao_secundario) between 2 and 40),
  mostrar_botao_secundario boolean not null default true,
  mostrar_servicos boolean not null default true,
  limite_servicos integer not null default 6 check(limite_servicos between 1 and 12),
  servicos_destaque uuid[] not null default '{}',
  mostrar_agendamento boolean not null default true,
  mostrar_acompanhamento boolean not null default true,
  mostrar_vitrine boolean not null default true,
  filtro_vitrine text not null default 'todos' check(filtro_vitrine in ('todos','seminovos','acessorios','destaques')),
  mostrar_contato boolean not null default true,
  mostrar_whatsapp boolean not null default true,
  mostrar_telefone boolean not null default true,
  mostrar_instagram boolean not null default true,
  mostrar_email boolean not null default true,
  mostrar_endereco boolean not null default true,
  mostrar_mapa boolean not null default true,
  mostrar_horario boolean not null default true,
  mostrar_google_avaliacao boolean not null default true,
  mostrar_como_funciona boolean not null default true,
  whatsapp_mensagem text not null default 'Olá! Vim pela página da assistência e gostaria de mais informações.' check(length(whatsapp_mensagem) between 2 and 300),
  cor_destaque text not null default '#4A5C6A' check(cor_destaque ~ '^#[0-9A-Fa-f]{6}$'),
  cor_fundo text not null default '#CCD0CF' check(cor_fundo ~ '^#[0-9A-Fa-f]{6}$'),
  cor_texto text not null default '#06141B' check(cor_texto ~ '^#[0-9A-Fa-f]{6}$'),
  preset text not null default 'elegante' check(preset in ('minimalista','escuro','elegante','tecnologico','claro','premium','personalizado')),
  ordem_secoes text[] not null default array['hero','como_funciona','servicos','vitrine','contato'],
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

insert into public.pagina_publica_config(empresa_id) select id from public.empresas on conflict do nothing;

create or replace function private.criar_pagina_publica_config() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.pagina_publica_config(empresa_id) values(new.id) on conflict do nothing;return new;
end $$;
create trigger criar_pagina_publica_config after insert on public.empresas for each row execute function private.criar_pagina_publica_config();

alter table public.pagina_publica_config enable row level security;
revoke all on public.pagina_publica_config from anon,authenticated;
grant select,insert,update on public.pagina_publica_config to authenticated;
create policy pagina_gestor_select on public.pagina_publica_config for select to authenticated using(private.can_manage_company(empresa_id));
create policy pagina_gestor_insert on public.pagina_publica_config for insert to authenticated with check(private.can_manage_company(empresa_id));
create policy pagina_gestor_update on public.pagina_publica_config for update to authenticated using(private.can_manage_company(empresa_id)) with check(private.can_manage_company(empresa_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('logos-empresas','logos-empresas',true,4194304,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy logos_public_select on storage.objects for select to anon,authenticated using(bucket_id='logos-empresas');
create policy logos_gestor_insert on storage.objects for insert to authenticated with check(bucket_id='logos-empresas' and name ~ '^[0-9a-f-]{36}/' and private.can_manage_company(split_part(name,'/',1)::uuid));
create policy logos_gestor_update on storage.objects for update to authenticated using(bucket_id='logos-empresas' and name ~ '^[0-9a-f-]{36}/' and private.can_manage_company(split_part(name,'/',1)::uuid)) with check(bucket_id='logos-empresas' and name ~ '^[0-9a-f-]{36}/' and private.can_manage_company(split_part(name,'/',1)::uuid));
create policy logos_gestor_delete on storage.objects for delete to authenticated using(bucket_id='logos-empresas' and name ~ '^[0-9a-f-]{36}/' and private.can_manage_company(split_part(name,'/',1)::uuid));

create or replace function public.catalogo(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',e.id,'nome',e.nome,'slug',e.slug,'horario',e.horario,'solicitar_endereco',e.solicitar_endereco,'servicos',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'nome',s.nome,'duracao',s.duracao,'descricao',s.descricao,'preco',s.preco,'categoria',s.categoria) order by s.nome) from public.servicos s where s.empresa_id=e.id and s.ativo),'[]'::jsonb))
 from public.empresas e where e.slug=p_slug and private.public_company_available(e.id)
$$;

create or replace function public.perfil_assistencia(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select public.catalogo(p_slug)||jsonb_build_object(
  'telefone',e.telefone,'whatsapp',e.whatsapp,'email',e.email_publico,'endereco',e.endereco,'numero',e.numero_endereco,'complemento',e.complemento,'bairro',e.bairro,'cidade',e.cidade,'estado',e.estado,'cep',e.cep,
  'descricao',e.descricao_publica,'slogan',e.slogan,'logo',e.logo_url,'instagram',e.instagram,'site',e.site,'google_maps',e.google_maps_url,'google_business',e.google_business_url,'google_avaliacao',e.google_avaliacao_url,'horario',e.horario,'fotos_obrigatorias',e.fotos_obrigatorias,
  'aparencia',jsonb_build_object('primaria',e.cor_primaria,'secundaria',e.cor_secundaria,'botao',e.cor_botao,'tema',e.tema_publico,'destaque',c.cor_destaque,'fundo',c.cor_fundo,'texto',c.cor_texto,'preset',c.preset),
  'pagina',jsonb_build_object('headline',c.headline,'subheadline',c.subheadline,'botao_primario',c.botao_primario,'botao_secundario',c.botao_secundario,'mostrar_botao_secundario',c.mostrar_botao_secundario,'mostrar_servicos',c.mostrar_servicos,'limite_servicos',c.limite_servicos,'servicos_destaque',c.servicos_destaque,'mostrar_agendamento',c.mostrar_agendamento,'mostrar_acompanhamento',c.mostrar_acompanhamento,'mostrar_vitrine',c.mostrar_vitrine,'filtro_vitrine',c.filtro_vitrine,'mostrar_contato',c.mostrar_contato,'mostrar_whatsapp',c.mostrar_whatsapp,'mostrar_telefone',c.mostrar_telefone,'mostrar_instagram',c.mostrar_instagram,'mostrar_email',c.mostrar_email,'mostrar_endereco',c.mostrar_endereco,'mostrar_mapa',c.mostrar_mapa,'mostrar_horario',c.mostrar_horario,'mostrar_google_avaliacao',c.mostrar_google_avaliacao,'mostrar_como_funciona',c.mostrar_como_funciona,'whatsapp_mensagem',c.whatsapp_mensagem,'ordem_secoes',c.ordem_secoes)
 ) from public.empresas e join public.pagina_publica_config c on c.empresa_id=e.id where e.slug=p_slug and private.public_company_available(e.id)
$$;

create or replace function public.vitrine_publica(p_slug text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'produtos',case when not c.mostrar_vitrine or c.filtro_vitrine='seminovos' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'nome',p.nome,'descricao',coalesce(p.descricao_vitrine,p.descricao),'preco',p.preco,'foto',p.foto_url,'condicao','Novo') order by p.nome) from public.pecas p where p.empresa_id=e.id and p.na_vitrine and p.ativo and p.quantidade>0 and (c.filtro_vitrine<>'acessorios' or p.tipo='Acessório')),'[]'::jsonb) end,
  'seminovos',case when not c.mostrar_vitrine or c.filtro_vitrine='acessorios' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'nome',trim(concat_ws(' ',s.marca,s.modelo)),'descricao',s.estado,'preco',s.preco_venda,'foto',s.foto_urls[1],'condicao','Seminovo') order by s.adquirido_em desc) from public.seminovos s where s.empresa_id=e.id and s.na_vitrine and s.status='pronto_venda'),'[]'::jsonb) end,
  'whatsapp',coalesce(e.whatsapp,e.telefone)
 ) from public.empresas e join public.pagina_publica_config c on c.empresa_id=e.id where e.slug=p_slug and private.public_company_available(e.id)
$$;

revoke all on function public.perfil_assistencia(text),public.vitrine_publica(text) from public,anon,authenticated;
grant execute on function public.perfil_assistencia(text),public.vitrine_publica(text) to anon,authenticated;

commit;
