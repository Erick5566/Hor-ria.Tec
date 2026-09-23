# Auditoria da Horária — 22/09/2026

## Escopo e evidências

Auditoria sem correções. Nenhuma migration, política, dado de negócio, configuração de autenticação ou deploy foi alterado.

A pasta original está no commit `be06933`, de 17/09. O código atual foi obtido do GitHub no commit [4e884fc](https://github.com/Erick5566/Hor-ria.Tec/tree/4e884fc826487468f498de09885ba19144f596b5), de 22/09, em uma cópia temporária de auditoria. As observações abaixo se referem a essa versão e, quando indicado, às definições consultadas diretamente no Supabase.

Foram inventariados 140 arquivos de código, estilos, migrations e funções. Foram examinados fluxos, controles de acesso, consultas, componentes compartilhados e pontos de integração. Isso não equivale a executar cada ação de cada tela.

### Validação executada

| Verificação | Resultado e limite |
|---|---|
| Testes automatizados da versão atual | **12 passaram; 12 falharam**, de 24. Falha principal: `function public.agenda_period(date, date) does not exist` ao aplicar migrations. |
| TypeScript da versão atual | Passou. Edge Functions estão excluídas do `tsconfig.json`. |
| Build da versão atual | Passou. Não comprova disponibilidade das RPCs. O aviso de múltiplos lockfiles decorreu da cópia de auditoria dentro da pasta original. |
| Pasta antiga | 24/24 testes, TypeScript e build passaram. **Esse resultado não valida a versão atual.** |
| Supabase real | Consulta somente de metadados, funções, políticas, migrations e advisors. As 35 tabelas do schema public têm RLS habilitada. |
| Funções publicadas | `public-booking`, `public-tracking` e `whatsapp-notifications` estão ACTIVE. Isso não comprova configuração dos provedores nem entrega de mensagens. |
| Produção HTTP | /, /entrar, /recuperar-senha, /acompanhar e /central-tech retornaram 200. /painel e /admin retornaram 307 para login sem sessão. Headers CSP presentes. |
| Navegador | Página pública de central-tech e consulta de reparo renderizaram; nenhum erro de console observado nessas verificações. |
| Responsividade | /central-tech sem overflow horizontal medido em 360, 390, 768, 1024 e 1440px. Inspeção visual pontual em 390px. |
| Fluxos privados e persistência ponta a ponta | Não executados: navegador sem sessão autenticada. Não foram criadas contas, OS, vendas ou pagamentos em produção, em respeito ao pedido de leitura. |
| Isolamento atual entre duas empresas | Não certificado ponta a ponta nesta auditoria. RLS habilitada e vínculos compostos são evidências favoráveis, mas a suíte atual falha antes de cobrir vários módulos. |
| Dependências | pnpm audit --prod falhou com fetch failed. A verificação de CVEs ficou inconclusiva. |

**Legenda:** comprovado = código, metadado ou teste observado; risco = cenário derivado do código, ainda sem reprodução ponta a ponta; pendente = depende de acesso/configuração/teste adicional.

## A. RESUMO EXECUTIVO

A Horária tem uma base funcional relevante: Next.js App Router, React, TypeScript estrito, Supabase Auth/Postgres/Storage, OS como centro da operação, catálogo, agenda, clientes, equipamentos, diagnóstico, orçamento, estoque e financeiro. Há componentes próprios e evolução real em segurança e performance.

**Forças:** RLS em todas as tabelas públicas consultadas; foreign keys com empresa_id nos principais vínculos; bucket privado e URLs assinadas; autenticação validada no servidor; MFA administrativo no código e no banco; recuperação de senha implementada; paginação em módulos principais; carregamento dinâmico; cabeçalhos de segurança; estados de erro e componentes compartilhados.

**Fragilidades principais:** banco atual não é reproduzível pelo repositório; suíte de testes quebrada; autorização financeira incompleta em RPC; métricas financeiras com dupla contagem; retomada de OS após falha de upload vulnerável a duplicação; módulos antigos inacessíveis por rota; persistência local de dados pessoais sem limpeza explícita; interfaces extensas e CSS acumulado.

**Conclusão:** adequado para validação controlada, mas ainda não recomendável ampliar uso comercial sem resolver autorização, migrations e regressões automatizadas. Nenhuma falha CRÍTICA de vazamento entre empresas foi comprovada; isso não constitui certificação de segurança.

## B. TOP 10 PROBLEMAS MAIS IMPORTANTES

| # | Categoria / gravidade | Problema e impacto | Local exato | Correção sugerida |
|---|---|---|---|---|
| 1 | BANCO / ARQUITETURA — ALTO | Migrations dependem de RPCs ausentes no Git. Ambiente novo não pode ser reconstruído; recuperação e homologação ficam frágeis. | `supabase/migrations/20260920210026_security_hardening_prelaunch.sql`; ausência das definições de agenda_period, dashboard_overview, records_list_page e outras. | Versionar definições canônicas e dependências; reconciliar histórico sem reaplicar scripts destrutivamente; validar banco vazio. |
| 2 | SEGURANÇA — ALTO | records_list_page retorna soma de financeiro para qualquer membro ativo, embora leitura direta de financeiro seja exclusiva de OWNER/ADMIN. | RPC **public.records_list_page** no Supabase; consumidor `components/records.tsx:100`. | Aplicar autorização de gestor às métricas monetárias ou redefinir explicitamente a permissão; testar atendente/técnico e flags. |
| 3 | BUG / QUALIDADE — ALTO | 12 testes falham antes de exercitar funcionalidades atuais. Build verde pode esconder regressões de banco. | `tests/helpers.mjs`, `tests/*.test.mjs`, migration de hardening. | Corrigir cadeia de migrations, mocks de Auth/roles e executar suíte completa no CI. |
| 4 | BUG / FINANCEIRO — ALTO | Métrica global de relacionamento soma receitas de financeiro e vendas; finalizar_venda já insere a receita no financeiro. Uma venda paga pode entrar duas vezes. | RPC **public.records_list_page**, campo metrics.relationship; `supabase/migrations/20260917020000_vendas_identidade.sql`, finalizar_venda. | Definir fonte única de receita e conciliar reparos, loja e seminovos com testes de valores conhecidos. |
| 5 | BUG / UX — ALTO | createdId existe somente no estado React. Se a OS foi criada e upload falhou, recarregar restaura rascunho sem identificar a OS já criada; reenviar pode duplicar. | `components/order-form.tsx:30,67,252–293`; `lib/photos.ts`. | Persistir ID e estágio da operação; idempotência no servidor; recuperação explícita de entrada incompleta. |
| 6 | MELHORIA DE PRODUTO / FUNCIONAL — MÉDIO | Vendas, seminovos, vitrine e pós-venda têm componentes, mas não constam da allowlist de módulos nem do roteador de componentes atual. | `app/painel/[module]/page.tsx`; `components/admin-module.tsx`; sales, used-devices, showcase, after-sales. | Confirmar decisão de escopo. Se continuam parte do produto, restaurar acesso e testar permissões; caso contrário, documentar desativação. |
| 7 | SEGURANÇA / PRIVACIDADE — MÉDIO | Rascunhos de cliente/equipamento e fotos permanecem em localStorage/IndexedDB, chaveados só por empresa, sem limpeza no logout ou expiração aplicada. | `components/order-form.tsx:67–160`; `lib/photos.ts`; fluxos de saída. | Chavear por usuário e empresa, expirar e limpar dados; informar persistência em dispositivos compartilhados. |
| 8 | BUG / PRODUTO — MÉDIO | Sequência de fotos exige a primeira imagem independentemente da configuração fotos_obrigatorias. | `components/order-form.tsx`, etapa 3; `components/photos.tsx:342`, skipCurrent. | Passar a regra da empresa e permitir continuar sem foto quando opcional; manter recomendação. |
| 9 | UI/DESIGN / ACESSIBILIDADE — MÉDIO | Tema usa azul #1d6dff, verde e roxo; texto secundário #8290a6 sobre branco tem contraste aproximado de 3,24:1 e captions de 0,64rem. | `app/theme.css:21–42,112–116`. | Reconciliar paleta oficial; elevar contraste de texto pequeno e escala mínima legível. |
| 10 | PERFORMANCE / ARQUITETURA — MÉDIO | Alguns detalhes e formulários continuam baixando tabelas inteiras, apesar de paginação nas listas principais. | `lib/assistencia.ts:286`; `components/record-detail.tsx:30`; `components/order-form.tsx:25`. | Consultar por cliente/equipamento, paginar históricos e buscar opções sob demanda. |

## C. BUGS E PROBLEMAS FUNCIONAIS

| Prioridade | Problema | Arquivo/Tela | Impacto | Correção sugerida |
|---|---|---|---|---|
| P1 | Cadeia SQL incompleta — reproduzido nos testes | Migrations / tests/helpers.mjs | Instalação nova falha | Incluir SQL faltante e testar do zero |
| P1 | Dupla contagem da receita de loja — confirmada pela fórmula | records_list_page / Clientes | Indicador monetário incorreto | Uma origem contábil por receita |
| P1 | Reenvio após OS criada sem persistir seu ID — risco | order-form.tsx | Duplicação, fotos dispersas e retrabalho | Idempotência + retomada |
| P2 | Fotos opcionais tratadas como obrigatórias | order-form.tsx / photos.tsx | Técnico fica bloqueado sem foto | Respeitar configuração |
| P2 | Módulos presentes no código sem rota habilitada | painel/[module] / admin-module | Funcionalidade não acessível | Resolver escopo e roteamento |
| P2 | Carregamentos paginados sem proteção contra respostas fora de ordem | components/records.tsx, finance.tsx | Busca anterior pode sobrescrever busca/página atual sob latência | AbortController ou número de geração da consulta |
| P2 | Diagnóstico usa upsert sem controle de versão | components/diagnosis.tsx:39 | Dois técnicos podem sobrescrever alterações mutuamente | Comparar versão/atualizado_em e avisar conflito |
| P2 | Atualização do cliente ocorre antes da criação da OS, em chamada separada | order-form.tsx:254 | Cadastro muda mesmo se a criação posterior falhar | Operação atômica ou feedback separado |
| P2 | localStorage.setItem sem tratamento de falha | order-form.tsx:139 | Quota/storage bloqueado pode interromper o componente | try/catch e rascunho em memória como fallback |
| P3 | URLs de fotos expiram em uma hora sem renovação programada | components/photos.tsx:958 | Fotos podem falhar ao reabrir após longa permanência | Renovar ao expirar/retomar foco |

Não foram identificados dados fictícios intencionalmente usados como indicadores no código examinado. Textos de exemplo em formulários não são mocks. Não foi executado teste de cada botão privado.

## D. SEGURANÇA

| Severidade | Vulnerabilidade ou risco | Local | Risco | Solução |
|---|---|---|---|---|
| ALTO | Autorização financeira contornada por agregação em SECURITY DEFINER | records_list_page, Supabase real | Técnico/atendente recebe valores não disponíveis pela política da tabela | Autorizar cada saída monetária no servidor |
| MÉDIO | Segredos de aparelhos legíveis por qualquer membro com can_access_company | public.equipamento_segredos; policies tenant_member_* | Acesso mais amplo que o necessário a senhas reversíveis | Restringir função, auditar revelação e definir retenção; avaliar cifragem com gestão de chave |
| MÉDIO | Dados pessoais/fotos persistidos no navegador sem expiração e limpeza | order-form / lib/photos / saída | Exposição em computador compartilhado | Limpar e segregar rascunhos; TTL real |
| MÉDIO | Cache de linhas chaveado por empresa/tabela, não usuário/perfil | lib/assistencia.ts:315–400 | Troca de usuário da mesma empresa pode reutilizar cache; cache inicial ignora idade até nova carga | Invalidar no logout/troca de papel e incluir identidade na chave |
| MÉDIO | Limite global por IP usa lock com IP+recurso+ação | 20260920215338_quote_tracking_hardening.sql | Requisições simultâneas a recursos diferentes podem ultrapassar limite agregado por IP | Lock do mesmo contador global ou contador atômico |
| MÉDIO | CSP aceita unsafe-inline em scripts | next.config.ts | Defesa contra XSS menos forte; não prova XSS explorável | Nonce/hash compatível com Next; teste de CSP antes de endurecer |
| BAIXO / A VALIDAR | Origem do IP aceita vários headers | Edge Functions public-booking/public-tracking | Rate limit depende de headers confiáveis reescritos pelo gateway | Confirmar contrato do proxy; usar apenas origem confiável |
| BAIXO | Endpoint CEP sem cache, timeout explícito ou limite na aplicação | app/api/cep/[cep]/route.ts | Consumo de chamadas e demora em indisponibilidade externa | Cache por CEP, prazo de resposta e limite proporcional |

**Pontos positivos confirmados:** JWT validado com getUser antes do contexto; cookie HttpOnly/SameSite/Secure; checagem de Origin no endpoint de sessão; MFA exigido por require_super_admin; tracking RPCs revogadas para anon/authenticated e mediadas por Edge Function; validação de payload e rate limits; storage privado; uso de consultas parametrizadas/RPC, sem evidência encontrada de concatenação de SQL com entradas públicas.

RLS ligada não garante sozinha autorização de SECURITY DEFINER. Os avisos de funções executáveis dos advisors exigem inspeção do corpo; não foram tratados automaticamente como vulnerabilidades. Tabelas internas sem políticas têm acesso direto negado por RLS, o que pode ser intencional. [Referência do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

Não foi comprovado acesso entre tenants diferentes nesta análise. Não foram realizados brute force, exploração invasiva, alteração de MFA ou envio de recuperação de senha. O teste de entrega do e-mail e as configurações de CAPTCHA/SMTP permanecem pendentes.

## E. DESIGN E UX

| Prioridade | Tela/Componente | Problema visual/UX | Sugestão |
|---|---|---|---|
| P2 | app/theme.css | Tema se afasta da paleta oficial; botões usam gradiente azul | Voltar aos seis tons definidos, preservando semântica de estado com parcimônia |
| P2 | MetricCard | Captions pequenas e contraste 3,24:1 | Texto secundário mais escuro, ao menos contraste adequado para texto normal |
| P2 | Nova OS | Sete ângulos, primeiro obrigatório mesmo quando configuração é opcional | Fluxo compacto com recomendação e opção explícita de pular |
| P2 | Página pública | Mensagem “Confirmação pelo WhatsApp” independe de comprovação de integração | Diferenciar registro da solicitação, retorno humano e mensagem efetivamente enviada |
| P2 | Funcionário | Menu mostra áreas que podem ter dados mascarados/restritos | Ocultar ações não autorizadas e explicar ausência de permissão |
| P3 | Configurações / Minha assistência | Ambas renderizam CompanySettings | Unificar destino ou separar finalidades claramente |
| P3 | “Diagnósticos” no menu | Abre mesa-reparo, título/conceito diferente | Usar nomenclatura consistente |
| P3 | Página do cliente / Minha página / Minha assistência | Múltiplos caminhos relacionados à mesma presença pública | Definir um editor principal e links de contexto |
| P3 | Ícones em workspace.tsx e MetricCard | Símbolos Unicode variam conforme fonte/plataforma | Conjunto pequeno consistente, mantendo rótulos textuais |

**Padronização real:** MetricCard/MetricGrid, SemanticBadge/Badge, Heading, Empty, ErrorBox, Field e Pagination existem em components/ui.tsx. Button, Input, Select, Textarea, Modal e Table não têm abstração React central equivalente; controles nativos são normalizados pelo CSS. Isso é aceitável para inputs simples, mas modais precisam compartilhar comportamento de teclado/foco, não apenas aparência.

**Por perfil:** dono precisa confiar nos totais e retomar falhas sem duplicar; funcionário precisa permissões coerentes em UI e banco; cliente precisa saber se a solicitação foi aceita e quando terá resposta; administrador precisa migrations reproduzíveis e testes verdes antes de releases. Essas melhorias têm mais valor agora que novas funções.

## F. PERFORMANCE

| Prioridade | Problema | Local | Melhoria |
|---|---|---|---|
| P2 | Download completo em blocos de 1.000 | lib/assistencia.ts rows; record-detail | Consultas filtradas no servidor e paginação |
| P2 | Detalhe carrega clientes, equipamentos, OS, orçamentos, histórico e vendas de toda empresa | record-detail.tsx | Uma consulta agregada limitada ao registro |
| P2 | 20 foreign keys sem índice de cobertura apontadas pelo advisor | Supabase: financeiro/venda, mesas/OS, garantias, outros | Priorizar com EXPLAIN e volume; não criar tudo sem medir |
| P2 | Métricas fazem agregações e subconsultas correlacionadas | records_list_page | Medir planos, agregar conjuntos e evitar somas repetidas |
| P3 | Estado de workspace concentra sessão, filtros e alertas | workspace.tsx | Separar contextos por frequência de mudança |
| P3 | Mais de 10 mil linhas de operations.css e regras legadas | app/operations.css, workspace.css, theme.css | Remover regras comprovadamente sem uso após regressão visual |
| P3 | Retenção de objetos em cache sem limite | rowCache | Limite/evicção e limpeza por sessão |
| P3 | CEP sempre consulta serviço externo | API CEP | Cache e timeout |

Há ganhos já implementados: módulos dinâmicos, paginação nas listas, debounce de busca, compressão de fotos, lazy loading e assinatura de URLs em lote. Não medi LCP/INP/CLS nem fiz teste de carga; não atribuo tempos ou capacidade de usuários sem evidência. [Advisor de índices](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

## G. BANCO / SUPABASE

| Prioridade | Problema | Local | Solução |
|---|---|---|---|
| P1 | Definições remotas ausentes no repositório | RPCs de paginação/dashboard; hardening | Migration canônica completa e teste de instalação |
| P1 | Migration diz que definições endurecidas ficam apenas no histórico remoto | 20260920215338_quote_tracking_hardening.sql, comentário final | Versionar os corpos efetivos das seis funções citadas |
| P1 | Teste security_surface exige anon em solicitar_reparo, em conflito com bloqueio posterior | supabase/tests/security_surface.sql | Atualizar contrato para chamada exclusiva do serviço |
| P2 | Alteração de funções por replace textual | 20260920223000_super_admin_mfa_and_role_boundaries.sql; 20260921214500_fix_dashboard_chart_anchor.sql | CREATE OR REPLACE completo e teste da regra final |
| P2 | Datas/versões locais diferem do histórico remoto | supabase/migrations vs list_migrations | Reconciliação documentada; não executar push indiscriminado |
| P2 | Contador de rate limit limpa só registros do IP que volta a consultar | public_action_rate_limits | Rotina global de retenção, com índice apropriado |
| P2 | Concorrência de diagnóstico sem versão | diagnosticos / upsert | Controle otimista de concorrência |
| P3 | Técnico é texto livre | ordens_servico.tecnico | Identidade opcional vinculada a membro, preservando histórico textual |

Há modelagem útil: chaves compostas com empresa_id, restrições de status, isolamento nas relações cliente/equipamento/OS e operações de estoque no banco. Não recomendo trocar o banco ou recriar as tabelas. Cascatas, histórico e retenção devem ser validados com casos de exclusão em ambiente de teste antes de qualquer ajuste.

## H. RESPONSIVIDADE E ACESSIBILIDADE

**Testado:** página /central-tech sem overflow horizontal em 360/390/768/1024/1440px; layout empilhado observado em 390px. Esse resultado não é extensível automaticamente ao painel autenticado.

**Problemas reais no código:**
- Fotos/câmera têm role=dialog, mas vários lightboxes não implementam foco inicial, contenção de foco, restauração ao fechar e Escape. Local: components/photos.tsx, overlays em diferentes etapas.
- Modal de estoque e agenda duplicam comportamento; aria-modal por si só não impede Tab de alcançar o conteúdo de fundo.
- Captions de métricas têm aproximadamente 10,24px e contraste 3,24:1 sobre branco.
- Abas em record-detail usam botões visuais sem padrão completo tablist/tab/tabpanel e navegação por setas.
- Campos em grande parte usam label e ErrorBox usa role=alert, o que é positivo; erros de formulário não estão uniformemente associados ao campo com aria-describedby/aria-invalid.

**Riscos que precisam de sessão para medir:** tabelas e modais privados em 360/390px; menu e foco em tablet; gráficos em 768/1024px; uso com zoom 200%; câmera real em Android/iOS; teclado virtual. Não classifiquei esses casos como aprovados.

## I. ARQUITETURA / QUALIDADE DE CÓDIGO

- Stack enxuta, sem necessidade demonstrada de migração de framework.
- App Router organiza páginas; componentes próprios concentram lógica cliente; Supabase concentra regras transacionais.
- public-page-settings tem cerca de 1.415 linhas; photos, 1.087; workspace, 982; company-settings, 815. Separar por responsabilidades reduz risco.
- Hooks de carregamento, realtime, paginação, loading e erro são repetidos entre módulos.
- Muitos tipos são declarados manualmente e o cliente Supabase não utiliza Database gerado; TypeScript não detecta RPC ausente.
- Typecheck exclui supabase/functions; falta uma verificação Deno independente.
- Não há error.tsx/global-error.tsx na árvore atual; falhas inesperadas não têm recuperação específica do produto.
- runtime-smoke segue redirecionamentos e aceita página de login como sucesso do painel; não prova renderização autenticada. Também trata 404 esperado como falha genérica.
- Componentes de vendas/seminovos/pós-venda/vitrine ficaram sem entrada no roteamento atual.
- CSS global, overrides por módulo e tema final coexistem; remover estilos por impressão visual seria arriscado.

Estrutura sugerida apenas na evolução: manter app como roteamento, agrupar hooks/serviços/tipos por domínio (ordens, clientes, estoque), preservar ui compartilhada e manter SQL canônico junto dos testes. Não há justificativa para reescrever o SaaS.

## J. ROADMAP DE MELHORIAS

| Fase | Item | Dificuldade | Risco da alteração | Impacto para usuário |
|---|---|---|---|---|
| 1 — imediatamente | Fechar autorização de valores nas RPCs | Média | Alto: pode bloquear papéis legítimos se mal especificado | Protege dados financeiros |
| 1 | Reconciliar migrations e recuperar suíte verde | Alta | Alto no banco existente; validar isoladamente | Releases e recuperação confiáveis |
| 1 | Corrigir dupla contagem de receita | Média | Médio | Indicadores confiáveis |
| 1 | Idempotência e retomada de OS | Média/alta | Médio | Evita duplicações e perda de contexto |
| 2 — estabilidade e UX | Respeitar foto opcional; tratar quota do rascunho | Baixa/média | Baixo | Menos bloqueios no atendimento |
| 2 | Expirar/segregar/limpar rascunhos e cache | Média | Médio: proteger rascunhos legítimos | Privacidade em dispositivo compartilhado |
| 2 | Controle de concorrência e respostas antigas | Média | Médio | Evita sobrescritas e telas inconsistentes |
| 2 | Resolver disponibilidade dos módulos sem rota | Baixa/média | Médio | Escopo claro |
| 2 | Testes E2E por papel e tenant, recuperação e upload | Alta | Baixo em homologação | Confiança no fluxo completo |
| 3 — visual e performance | Reconciliar paleta e contraste | Baixa/média | Baixo | Identidade e legibilidade |
| 3 | Modal acessível e abas padronizadas | Média | Médio | Uso por teclado e celular |
| 3 | Consultas por registro e índices medidos | Média | Médio | Crescimento sem lentidão progressiva |
| 3 | Reduzir CSS legado e separar componentes longos | Média | Médio | Manutenção mais segura |
| 4 — futuras | Observabilidade, teste de restauração e retenção | Média/alta | Médio | Continuidade operacional |
| 4 | Validar integrações externas e alinhar promessas de WhatsApp | Média | Médio | Comunicação previsível |

Não incluí novas funções comerciais: a prioridade é tornar confiáveis as funções existentes.

## K. NOTA FINAL

Notas diagnósticas provisórias, baseadas nas evidências disponíveis; não são certificação nem medição estatística. UI privada e fluxos autenticados tiveram avaliação por código.

| Área | Nota / 10 | O que falta para 9/10 |
|---|---:|---|
| Segurança | 6 | Resolver bypass de agregados, restringir segredos, limpar cache/rascunhos e provar matriz de tenants/papéis |
| Estabilidade | 5 | Suite verde, banco reproduzível, retomada idempotente e testes de falha |
| UX | 6 | Foto opcional coerente, permissões claras, recuperação de operações e menos destinos duplicados |
| UI/design | 6 | Paleta oficial, contraste, tipografia e regressão visual autenticada |
| Performance | 6 | Eliminar leituras completas nos detalhes; medir planos, bundle e Web Vitals |
| Arquitetura | 5 | SQL versionado, tipos gerados, hooks compartilhados e componentes menores |
| Responsividade | 7 | Validar todos os módulos privados, modais e câmera em aparelhos reais |
| Prontidão para produção | 5 | Corrigir P1, validar fluxo real em homologação, backups e integrações |

**Decisão:** não considero o projeto pronto para expansão comercial irrestrita. A base merece evolução incremental; não precisa ser refeita. As correções devem começar por autorização e reprodutibilidade, seguidas de integridade dos indicadores e fluxo de OS.

**Nenhuma correção foi aplicada. Aguardando autorização para iniciar as mudanças.**
