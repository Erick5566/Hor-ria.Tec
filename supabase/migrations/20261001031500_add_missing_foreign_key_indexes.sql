begin;

create index if not exists assinaturas_plano_id_fk_idx
  on public.assinaturas (plano_id);
create index if not exists configuracoes_plataforma_atualizado_por_fk_idx
  on public.configuracoes_plataforma (atualizado_por);
create index if not exists financeiro_venda_empresa_fk_idx
  on public.financeiro (venda_id, empresa_id);
create index if not exists fiscal_documents_criado_por_fk_idx
  on public.fiscal_documents (criado_por);
create index if not exists fiscal_settings_atualizado_por_fk_idx
  on public.fiscal_settings (atualizado_por);
create index if not exists garantias_criado_por_fk_idx
  on public.garantias (criado_por);
create index if not exists garantias_ordem_origem_empresa_fk_idx
  on public.garantias (ordem_origem_id, empresa_id);
create index if not exists garantias_peca_aplicada_empresa_fk_idx
  on public.garantias (peca_aplicada_id, empresa_id);
create index if not exists garantias_servico_empresa_fk_idx
  on public.garantias (servico_id, empresa_id);
create index if not exists movimentos_estoque_venda_empresa_fk_idx
  on public.movimentos_estoque (venda_id, empresa_id);
create index if not exists ordens_servico_mesa_empresa_fk_idx
  on public.ordens_servico (mesa_id, empresa_id);
create index if not exists pagamentos_assinatura_id_fk_idx
  on public.pagamentos (assinatura_id);
create index if not exists pagina_publica_config_atualizado_por_fk_idx
  on public.pagina_publica_config (atualizado_por);
create index if not exists pos_venda_cliente_empresa_fk_idx
  on public.pos_venda (cliente_id, empresa_id);
create index if not exists pos_venda_ordem_empresa_fk_idx
  on public.pos_venda (ordem_id, empresa_id);
create index if not exists pos_venda_seminovo_empresa_fk_idx
  on public.pos_venda (seminovo_id, empresa_id);
create index if not exists pos_venda_venda_empresa_fk_idx
  on public.pos_venda (venda_id, empresa_id);
create index if not exists seminovos_comprador_empresa_fk_idx
  on public.seminovos (comprador_id, empresa_id);
create index if not exists seminovos_criado_por_fk_idx
  on public.seminovos (criado_por);
create index if not exists seminovos_vendedor_empresa_fk_idx
  on public.seminovos (vendedor_id, empresa_id);
create index if not exists venda_itens_peca_empresa_fk_idx
  on public.venda_itens (peca_id, empresa_id);
create index if not exists vendas_criado_por_fk_idx
  on public.vendas (criado_por);

commit;