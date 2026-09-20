alter table public.empresas
  add column if not exists prazo_resposta_horas integer not null default 4
  check (prazo_resposta_horas between 1 and 72);

create or replace function public.perfil_assistencia(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
 select public.catalogo(p_slug)||jsonb_build_object(
  'telefone',e.telefone,'whatsapp',e.whatsapp,'email',e.email_publico,'endereco',e.endereco,'numero',e.numero_endereco,'complemento',e.complemento,'bairro',e.bairro,'cidade',e.cidade,'estado',e.estado,'cep',e.cep,
  'descricao',e.descricao_publica,'slogan',e.slogan,'logo',e.logo_url,'instagram',e.instagram,'site',e.site,'google_maps',e.google_maps_url,'google_business',e.google_business_url,'google_avaliacao',e.google_avaliacao_url,'horario',e.horario,'fotos_obrigatorias',e.fotos_obrigatorias,'prazo_resposta_horas',e.prazo_resposta_horas,
  'aparencia',jsonb_build_object('primaria',e.cor_primaria,'secundaria',e.cor_secundaria,'botao',e.cor_botao,'tema',e.tema_publico,'destaque',c.cor_destaque,'fundo',c.cor_fundo,'texto',c.cor_texto,'preset',c.preset),
  'pagina',jsonb_build_object('headline',c.headline,'subheadline',c.subheadline,'botao_primario',c.botao_primario,'botao_secundario',c.botao_secundario,'mostrar_botao_secundario',c.mostrar_botao_secundario,'mostrar_servicos',c.mostrar_servicos,'limite_servicos',c.limite_servicos,'servicos_destaque',c.servicos_destaque,'mostrar_agendamento',c.mostrar_agendamento,'mostrar_acompanhamento',c.mostrar_acompanhamento,'mostrar_vitrine',c.mostrar_vitrine,'filtro_vitrine',c.filtro_vitrine,'mostrar_contato',c.mostrar_contato,'mostrar_whatsapp',c.mostrar_whatsapp,'mostrar_telefone',c.mostrar_telefone,'mostrar_instagram',c.mostrar_instagram,'mostrar_email',c.mostrar_email,'mostrar_endereco',c.mostrar_endereco,'mostrar_mapa',c.mostrar_mapa,'mostrar_horario',c.mostrar_horario,'mostrar_google_avaliacao',c.mostrar_google_avaliacao,'mostrar_como_funciona',c.mostrar_como_funciona,'whatsapp_mensagem',c.whatsapp_mensagem,'ordem_secoes',c.ordem_secoes)
 ) from public.empresas e join public.pagina_publica_config c on c.empresa_id=e.id where e.slug=p_slug and private.public_company_available(e.id)
$$;
