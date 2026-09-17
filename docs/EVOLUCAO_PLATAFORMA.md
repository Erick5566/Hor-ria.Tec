# Evolução da Horária — análise do projeto existente

## O que já existe

- Autenticação Supabase por e-mail e senha, sessão validada no servidor e área `/painel` protegida.
- Multiempresa com `empresa_id`, vínculos de membros, RLS e bloqueios por assinatura/manutenção.
- Clientes, equipamentos, ordens de serviço, checklist, fotos privadas, diagnóstico, orçamento versionado, histórico e acompanhamento público.
- Agenda, serviços, catálogo de peças/produtos/acessórios, estoque, movimentações, baixa de peça em OS, financeiro e relatórios.
- Área `SUPER_ADMIN`, auditoria, limite de empresas, recursos globais e estrutura de assinatura.

## O que está parcialmente implementado

- Dashboard: possui OS, agenda, serviços e financeiro; ainda não inclui vendas, seminovos e pós-venda.
- Clientes: possui dados básicos, equipamentos, OS, orçamentos, histórico e valores de reparos; faltam compras, garantias e timeline comercial.
- Produtos/estoque: já permite SKU, código de barras, custo, venda, quantidade, fornecedor e alertas; faltavam descrição/foto e movimentos comerciais tipados.
- Serviços: possui nome, categoria, preço e duração; faltavam descrição, garantia padrão e inativação.
- Peça e mão de obra: orçamento separa peças e mão de obra; faltavam snapshots de custo e venda na aplicação real da peça.
- Financeiro: possui receitas/despesas e vínculo com OS; ainda não possui origens de venda e seminovos.
- Minha assistência e página pública: já possuem nome, descrição, telefone, endereço, horário e links; faltam identidade completa, logo e aparência por empresa.

## O que precisa ser criado

- Fase 1: Mesa de Reparo, mesas configuráveis, prioridade, início/prazo, garantia e dados complementares de clientes/produtos/serviços.
- Fase 2: venda de balcão transacional, financeiro por origem, identidade da assistência, logo e aparência segura.
- Fase 3: trade-in, seminovos, vitrine e pós-venda.
- Fase 4: suporte interno, busca global consolidada e relatórios avançados.

## Tabelas reutilizadas

`empresas`, `empresa_membros`, `perfis`, `clientes`, `equipamentos`, `ordens_servico`, `servicos`, `pecas`, `movimentos_estoque`, `pecas_aplicadas`, `orcamentos`, `financeiro`, `agendamentos`, `fotos_os`, `diagnosticos` e `historico_os`.

## Novas tabelas planejadas

- Fase 1: `mesas_reparo` e `garantias`.
- Fase 2: `vendas`, `venda_itens`, `venda_pagamentos` e configuração visual aditiva em `empresas`.
- Fase 3: `seminovos`, `seminovo_custos`, `trade_ins`, `vitrine_itens` e `pos_venda`.
- Fase 4: `suporte_solicitacoes` e `suporte_mensagens`.

Todas as tabelas de negócio terão `empresa_id`, chaves compostas para impedir vínculos cruzados e RLS baseada em membro da empresa.

## Dependências

1. Produtos e estoque sustentam peças em OS e vendas.
2. Orçamento aprovado sustenta reparo, financeiro e garantia.
3. Venda sustenta baixa de estoque e financeiro por origem.
4. Trade-in sustenta seminovos; seminovos sustentam vitrine e venda.
5. OS/venda concluída sustenta pós-venda e solicitação de avaliação.
6. Minha assistência e aparência sustentam as páginas públicas.

## Riscos e mitigação

- Alterar estados de OS pode quebrar acompanhamento e notificações: os estados existentes serão preservados.
- Recalcular custos antigos pode distorcer margem: custos e preços serão copiados para snapshots imutáveis no momento do uso/venda.
- Baixas concorrentes podem gerar estoque negativo: operações compostas continuarão em funções transacionais com bloqueio de linha.
- Novas tabelas podem vazar dados: RLS e chaves por `empresa_id` entram na mesma migration de criação.
- Personalização pode reduzir contraste: cores serão validadas e aplicadas somente às superfícies públicas permitidas.

## Ordem recomendada

1. Mesa de Reparo e metadados operacionais da OS.
2. Clientes, produtos e serviços complementares.
3. Custo de peça, mão de obra e garantia.
4. Vendas e integração financeira/estoque.
5. Minha assistência, agendamento e aparência.
6. Trade-in, seminovos e vitrine.
7. Pós-venda, Google, suporte, busca e relatórios.

## Progresso executado

- Fase 1 concluída: mesa de reparo, prioridade e prazo da OS, garantias, dados complementares e custos aplicados.
- Fase 2 concluída: vendas de balcão transacionais, baixa de estoque, financeiro por origem e identidade visual por assistência.
- Fase 3 concluída: entrada e venda de seminovos, vitrine pública controlada e pós-venda para OS, vendas identificadas e seminovos.
- As migrations das três fases foram aplicadas de forma aditiva, com RLS e vínculos compostos por `empresa_id`.
- Próxima frente: suporte interno, busca global e relatórios avançados.
