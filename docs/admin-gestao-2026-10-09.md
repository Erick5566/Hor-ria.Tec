# Melhorias do Super Admin — 09/10/2026

Branch: `feat/admin-gestao-2026-10-09`, baseada na branch auditada `audit/pre-lancamento-2026-10-09` (PR #94). Sem deploy, alterações de banco, envio de mensagens ou cobranças reais.

## Gestão de empresas

- Seis grupos clicáveis: todas, em atraso com valor em aberto, vencimento em até sete dias, teste terminando em 72 horas, sem acesso há sete dias e sem primeira OS.
- Contagem dos grupos recalculada com os dados recebidos e relógio atualizado a cada minuto. Empresas canceladas/suspensas administrativamente não aparecem nos grupos de adoção e próximos vencimentos.
- Busca por nome, responsável, e-mail, telefone e slug; aceita acentos e números com formatação.
- Filtros exatos para todos os status. “Ativa” não mistura empresas em teste.
- Ordenação por acesso, nome, cadastro, vencimento, valor em aberto e quantidade de OS.
- Paginação de 15 empresas e total/valor em aberto do filtro. A paginação é local sobre o resultado da RPC existente, não reduz o volume consultado ao servidor.
- CSV de todos os resultados filtrados, não apenas da página atual, com proteção contra fórmulas e BOM UTF-8.
- Atalhos no detalhe: gestão completa, página pública, copiar link, e-mail e WhatsApp com validação de telefone brasileiro. Não existe envio automático.
- Confirmação antes de descartar uma anotação não salva ao selecionar outra empresa.
- Ações de teclado em botões internos não disparam também a seleção da linha.

## Despesas e organização

- Gestão das empresas movida para antes das despesas, preservando indicadores financeiros existentes.
- Data da despesa editável, inicialmente na data de São Paulo, e observação opcional; persistência nas RPCs existentes.
- Expansão da lista de despesas carregadas, com aviso do limite de 50 registros.
- Tratamento explícito de falha no carregamento inicial e tela administrativa de nova tentativa, sem apresentar dados zerados como se fossem válidos.
- Novos controles responsivos e foco de teclado visível, mantendo a identidade azul/marinho. Layout adapta grupos, filtros, detalhes e formulário a telas estreitas.

## Validação

- `pnpm test`: **181/181 aprovados**, sem falhas nem skips.
- Nove novos testes cobrem grupos, limites de datas, busca/status, ordenação, exportação integral, segurança CSV, WhatsApp, rascunho e renderização/paginação.
- Teste existente de despesas ampliado para data de São Paulo, data retroativa e observação.
- `pnpm typecheck`: aprovado.
- `pnpm build`: aprovado após remoção do cache local `.next`, que estava inválido.
- `node tests/runtime-smoke.mjs`: 21 rotas aprovadas; rotas privadas seguem redirecionamento e não representam sessão autenticada real.
- `git diff --check`: aprovado.

Não houve validação visual autenticada em navegador/mobile nesta alteração. A renderização foi verificada em SSR com dados simulados, além de testes funcionais isolados. As pendências de homologação do relatório de lançamento continuam válidas. Permissões Super Admin + MFA, regras de assinatura e confirmação PIX foram preservadas. Nenhuma migration nova é necessária para estas ferramentas; a migration da auditoria continua dependendo de aprovação e homologação próprias.
