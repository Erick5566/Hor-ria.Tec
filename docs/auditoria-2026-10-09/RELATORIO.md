# Horária — auditoria de preparação para lançamento

Data: 09/10/2026 (America/Sao_Paulo).
Repositório: Erick5566/Hor-ria.Tec.
Base examinada: `main`, commit `46b4a068fc7b15a37216bc8b0d981e6ee39744a4`.
Branch: `audit/pre-lancamento-2026-10-09`.

## Decisão: NO-GO para lançamento certificado

Foram corrigidas falhas comprovadas no processamento de cobrança e nas exportações. A versão da branch passa em **172/172 testes**, TypeScript, build e smoke HTTP de **21 rotas**. A produção permanece inalterada: esta auditoria NÃO aplicou migration, NÃO fez deploy, NÃO enviou e-mails ou WhatsApp e NÃO gerou cobranças nem pagamentos reais.

A liberação automática após um PIX bancário **não está homologada**. O PIX oferecido pelo produto usa confirmação manual pelo Super Admin. Existe um webhook genérico, mas não foi identificado no repositório um adaptador de PSP que receba/liquide esse PIX e produza o evento assinado esperado. As variáveis da Vercel não puderam ser conferidas por falta de acesso. Não anunciar confirmação PIX automática até concluir a integração em sandbox e sua homologação.

Também faltam os testes reais de cadastro/login/recuperação/MFA e a verificação visual autenticada em celular e tablet. Testes locais aprovados não certificam esses fluxos externos.

## Regra comercial confirmada e preservada

| Item | Implementação atual | Evidência |
|---|---|---|
| Primeiro pagamento | R$ 44,99 | `configuracoes_plataforma.initial_payment_amount` no banco publicado; `lib/pix.ts` |
| Mensalidade | R$ 49,00 | `monthly_payment_amount` publicado; migration `20261007023854` |
| Teste de uma nova empresa | 7 dias desde a criação | Corpo publicado de `public.configurar_empresa` |
| Tolerância após vencimento | 24 horas | `billing_grace_hours = 24` publicado; cálculo de acesso |
| Primeiro vencimento após confirmação inicial | 7 dias após o pagamento | `admin_confirm_manual_payment`; testes de PIX manual |
| Renovações seguintes | 1 mês a partir do vencimento futuro, ou do pagamento se já vencido | Mesma RPC e testes |

Os 7 dias de teste e os 7 dias após o primeiro pagamento são períodos distintos. Não foram substituídos por teste de 24–48 horas. Valores e configurações comerciais existentes foram preservados. O webhook corrigido usa os mesmos valores configurados e, quando o provedor omite a próxima data, os mesmos períodos do PIX manual. Uma data explicitamente recebida do provedor permanece parte do contrato de integração e precisa ser homologada conforme essa regra.

## Funcionalidades verificadas

“APROVADO LOCAL” significa código + testes no ambiente isolado, não uma certificação de operação integral em produção.

| Área | Resultado | Evidência e limite |
|---|---|---|
| Autenticação e sessões | PARCIAL | `getServerAccess` valida usuário no Supabase, cookie HTTP-only, proteção SSR/proxy, sincronização de sessão. Contratos locais aprovados. Login real, expiração/renovação no navegador e credenciais não exercitados. |
| Cadastro e recuperação | PARCIAL | Rota de recuperação, validação de senha, termos e configuração local testados; criação de empresa transacional testada no banco isolado. Entrega do e-mail, redirects e confirmação de e-mail no Auth publicado não verificados. |
| Super Admin/MFA | APROVADO LOCAL + configuração confirmada | Testes rejeitam usuário comum e administrador sem `aal2` em RPCs administrativas. Produção tem um Super Admin com um fator MFA verificado. Desafio TOTP real não executado. |
| RLS e isolamento | APROVADO LOCAL + catálogo conferido | Testes multiempresa, permissões de OWNER/MANAGER/TECHNICIAN/ATTENDANT e restrição de dados sensíveis. Nenhuma tabela pública sem RLS. 78 políticas remotas coincidem com as locais na comparação do catálogo. Não houve simulação com duas contas reais em produção. |
| Storage e fotos | APROVADO LOCAL + configuração confirmada | `os-fotos` privado, limite 6 MiB; `logos-empresas` público, limite 4 MiB. Testes de autorização, tickets, correções auditadas e limpeza. Câmera física/iOS e upload real em sandbox pendentes. |
| OS, diagnóstico e orçamento | APROVADO LOCAL | Jornada pública até retirada, conferência de entrada, orçamento/versionamento/aprovação, diagnóstico restrito e transições de papel. Inclui teste de saldo financeiro sem duplicar receita. |
| Clientes e equipamentos | APROVADO LOCAL | Testes de cadastro, histórico, ciclo de vida, vínculos de empresa e permissões. |
| Estoque, peças e serviços | APROVADO LOCAL | Testes de baixa de peças, custos, estoque por papel e ciclo de serviços; bloqueios transacionais e isolamento. |
| Agenda | APROVADO LOCAL | Testes de disponibilidade, colisões, bloqueios e permissões de gestão. |
| Financeiro e exportações | APROVADO LOCAL COM CORREÇÃO | Testes de persistência/saldo e exportação com neutralização de fórmulas. Exportação financeira mantém o escopo da página atual, indicado no nome do arquivo. Download real em Excel/LibreOffice não exercitado. |
| Assinatura e bloqueio por vencimento | APROVADO LOCAL | Testes de status efetivo, tolerância, RLS com assinatura vencida e atualização de acesso. Configuração publicada lida sem alterações. |
| PIX manual | APROVADO LOCAL | Payload/CRC, valor inicial/renovação, confirmação com MFA, idempotência e recuperação após falha. Sem transferência bancária. |
| PIX automático/webhook | INCOMPLETO PARA OPERAÇÃO | Falhas do processador corrigidas apenas na branch. Falta comprovar adaptador de PSP, credenciais, eventos e assinatura no ambiente de teste. |
| Notificações por e-mail | APROVADO LOCAL + sinais operacionais | Testes de fila, autorização, idempotência, retries e falhas do provedor. Worker publicado ativo; cron de 10 min ativo; três últimas execuções bem-sucedidas; quatro notificações históricas `sent`. Não houve novo envio nem confirmação na caixa de entrada. |
| Atualização sem F5 | APROVADO LOCAL + publicação Realtime | Testes de eventos, polling, foco/visibilidade e proteção contra respostas antigas. 29 tabelas na publicação Realtime, incluindo OS, financeiro, empresas e assinaturas. Teste ao vivo com dois navegadores pendente. |
| Responsividade | PARCIAL | Testes existentes de renderização/contratos CSS aprovados. Login observado em produção a 1363×936, sem overflow da página e com campos visíveis. Não foi possível certificar layouts autenticados em 360/390 px e tablet. |

A suíte combina integração SQL real em PostgreSQL embarcado PGlite, componentes/handlers com transportes simulados e testes de contratos de código. PGlite simula Auth/Storage e não substitui Supabase Auth, Storage HTTP, Realtime real, concorrência entre conexões ou um PSP.

## Defeitos comprovados e correções

Commit `ef57da4` — processamento de cobrança:

1. **Criação de assinatura liberava acesso sem pagamento:** `subscription.created` fazia o mesmo que `payment.approved`. Agora apenas vincula o identificador externo, sem ativar a conta.
2. **Pagamento reutilizável entre empresas ou entregas:** a atualização da assinatura acontecia antes de ignorar o conflito do pagamento. Agora a identidade `(provider, external_payment_id)` é verificada antes de alterar acesso; divergência de empresa é rejeitada; pagamento aprovado repetido não renova outra vez. Há serialização por identidade de pagamento e bloqueios transacionais.
3. **Falha seguida de sucesso perdia a conciliação:** um pagamento anteriormente `REJECTED` permanecia rejeitado por `ON CONFLICT DO NOTHING`. Agora a confirmação promove o registro a `APPROVED` e conserva a integração com a fila de e-mail.
4. **Evento atrasado podia prejudicar conta paga:** uma rejeição de pagamento já aprovado é ignorada; uma tentativa falhada não encurta teste ou período pago ainda vigente.
5. **Evento podia remover suspensão administrativa:** pagamento automático não remove `SUSPENDED`/`CANCELED` administrativos. A confirmação manual pelo administrador continua com seu comportamento existente.
6. **Validação insuficiente:** aprovação exige identificador, BRL e valor configurado; próximo vencimento inválido é rejeitado. Nenhum registro preexistente foi alterado.
7. **Assinatura HMAC inválida podia gerar exceção:** igualdade de comprimento em caracteres não garantia igualdade de bytes em `timingSafeEqual`. O cabeçalho agora precisa ser hexadecimal no formato correto antes da comparação.
8. **Chave idempotente fora do conteúdo assinado:** o cabeçalho podia substituir `eventId`. Agora o identificador vem do JSON assinado; cabeçalho divergente retorna 400. O adaptador futuro deve enviar `eventId` no corpo.

Os cinco testes novos de banco foram executados também contra o corpo original da função: **0/5 passaram**, com falhas de asserção correspondentes aos defeitos. Com a correção, **5/5 passaram**. A reprodução foi exclusivamente local.

Migration criada pela CLI, ainda NÃO aplicada ao Supabase:
`supabase/migrations/20261009055734_harden_billing_event_processing.sql`.

Commit `3171c13` — exportações:

9. **CSV financeiro permitia fórmulas em texto exportado:** aspas de CSV não neutralizam fórmulas. O relatório de OS também não cobria espaços/controles antes do prefixo. Ambos usam `csvCell`, com escape de aspas e proteção contra `=`, `+`, `-`, `@` e prefixos de controle. Acentos, delimitadores e campos nulos foram testados. Nenhuma interface foi redesenhada.

## Testes executados

| Verificação | Resultado |
|---|---|
| Instalação `pnpm install --frozen-lockfile` | Aprovada; lockfile preservado |
| Baseline `pnpm test` | 163/163 aprovados |
| Baseline TypeScript/build/smoke | Aprovados |
| Reprodução dos cinco defeitos SQL no código original | 5 falhas esperadas, documentadas |
| Testes direcionados de cobrança, webhook e plataforma | 19/19 aprovados |
| Novos testes de CSV | 2/2 aprovados |
| Suíte final `pnpm test` | 172/172 aprovados, zero falhas/skips |
| `pnpm typecheck` | Exit code 0 |
| `pnpm build` | Exit code 0 |
| `node tests/runtime-smoke.mjs` | 21 rotas aprovadas |
| `git diff --check` | Aprovado |

O smoke HTTP segue redirecionamentos. Portanto, rotas privadas aprovadas nesse teste significam que responderam/redirecionaram adequadamente sem login; não significam que o painel autenticado foi exercitado. O build foi local, sem carregar credenciais de produção.

Evidências textuais: diretório `evidencias/` ao lado deste relatório. Runtime: Node 24.19.0, pnpm 11.25.0; versões instaladas pelo lockfile: Next 16.3.5, React 19.3.0, Supabase JS 2.116.0, TypeScript 5.9.3, PGlite 0.3.16.

## Verificações externas somente leitura

Projeto Supabase: `ijixyflyhiindirtqvxp`, Horária.tec, PostgreSQL 17.6, estado saudável informado pela API.

- Comparadas 115 assinaturas de funções locais/remotas, sem funções faltantes nessa seleção; 113 corpos coincidem após normalizar comentários/espaçamento/delimitadores. A divergência administrativa restante é sintática (aliases opcionais, coluna interna não utilizada e parênteses). A divergência funcional restante é o processador de cobrança corrigido nesta branch, ainda antigo na produção.
- 78 políticas de `public`, `private` e `storage` coincidem no catálogo comparado. Essa comparação é evidência adicional, não uma prova exaustiva de todos os triggers, grants, índices e constraints remotos.
- Histórico de migrations remoto não corresponde um a um às consolidações do Git, conforme `docs/production-migration-reconciliation.md`. **Não executar `db push` indiscriminadamente nem reaplicar migrations antigas.**
- A consulta agregada a pagamentos retornou zero registros. Não há histórico de pagamento aprovado no banco consultado para demonstrar homologação comercial.
- Cinco Edge Functions estão ativas: public-booking, public-tracking, invite-team-member, whatsapp-notifications e admin-billing-email. “Ativa” não comprova credenciais ou entrega ponta a ponta.
- O cron administrativo rodava `*/10 * * * *`; as três últimas execuções consultadas estavam `succeeded`.
- O alerta de cobrança atual é `billing_grace_started`: dispara após vencer e entrar nas 24h de tolerância. **Não é um lembrete 24h antes do vencimento.** O outro evento é pagamento aprovado. Não foi alterada essa regra.
- Consulta Vercel encontrou o projeto `hor-ria-tec-fba1`, mas inspeção e listagem de variáveis retornaram **403**, sem acesso ao escopo `pretovenicius196-1421`. CLI Vercel não disponível no ambiente. Não foi possível confirmar variáveis nem SHA do deployment ativo. O workflow Git só sincroniza a branch de produção após push validado em `main`; esta entrega fica em branch separada.
- Login público observado no navegador. O CAPTCHA requer interação humana e não foi resolvido. O ambiente local de navegador não possuía Chromium; download do executável falhou, impedindo a matriz automatizada de resoluções. Nenhuma medição mobile foi inventada.

## Pendências e riscos

| Prioridade | Pendência | Risco / intervenção necessária |
|---|---|---|
| Bloqueante | Publicar correções somente após aprovação | Produção ainda contém os defeitos encontrados. Revisar migration isolada, testar em sandbox e autorizar publicação na Vercel. |
| Bloqueante para promessa de automação | Integração PIX real em sandbox | QR estático e atualização da tela não detectam uma transferência bancária. Configurar/homologar um PSP e seu adaptador de eventos assinados ou assumir explicitamente operação manual. Não comprar serviço nem gerar cobrança sem autorização. |
| Bloqueante de certificação | Acesso ao projeto Vercel | Autorizar a integração na equipe correta e conferir presença/escopo de `HORARIA_BILLING_PROVIDER`, `HORARIA_BILLING_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` e configuração pública Supabase. Não enviar segredos no chat. |
| Bloqueante de certificação | Cadastro, login, recuperação, MFA | Executar com conta de teste autorizada, aceite humano de termos/CAPTCHA e controle do e-mail/TOTP. Confirmar URLs de recuperação, confirmação de e-mail e SMTP no Supabase Auth. |
| Bloqueante de certificação | Responsividade autenticada e câmera | Validar celular 360/390 px, tablet 768/1024 px e desktop 1366/1920 px: gráficos, tabelas, OS/fotos, agenda, exportação e tela de assinatura. Câmera traseira, permissões, refazer e salvar em iOS/Android. |
| Alta | Integração simultânea/manual × webhook | PGlite não prova concorrência real entre conexões. Homologar entregas simultâneas, retries, eventos atrasados, vínculo com empresa e concorrência com confirmação administrativa em PostgreSQL/Supabase de teste. |
| Média | Proteção de senhas vazadas desativada | Advisor do Auth detectou configuração desativada; avaliar habilitação conforme suporte do plano, sem contratar recursos automaticamente. |
| Média | `pg_net` no schema público | Advisor recomenda revisar/mover extensão. Não movida, pois cron/dispatch dependem dela e a mudança exige plano de compatibilidade. |
| Operacional | Entrega de e-mail e aviso desejado | Confirmar caixa de entrada/destinatário/remetente. Se o objetivo for avisar antes do vencimento, isso exige alteração de regra separada. |

Avisos de RLS sem policy em 11 tabelas e de funções `SECURITY DEFINER` acessíveis não foram “corrigidos” cegamente: há tabelas deliberadamente fechadas e RPCs públicas/controladas. Os testes validam guardas e projeções; remover esses acessos indiscriminadamente quebraria o produto.

Referências dos avisos: [políticas ausentes](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [extensão no schema público](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public), [funções públicas elevadas](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Sequência para obter GO

1. Revisar os commits e a migration desta branch.
2. Homologar a migration e o webhook em ambiente de teste com PSP simulado/sandbox, incluindo eventos duplicados/concorrentes e atualizações de acesso. Não usar o banco produtivo para fixtures.
3. Completar cadastro, recuperação, MFA, upload/câmera, responsividade e atualização entre dois navegadores.
4. Resolver o acesso Vercel e conferir configuração de ambiente; definir claramente confirmação PIX automática ou manual na operação comercial.
5. Com aprovação explícita, aplicar somente a migration nova revisada e publicar na Vercel; executar smoke pós-deploy e verificar o SHA efetivo.
6. Registrar evidências dos itens restantes e reavaliar GO. Não aprovar lançamento apenas pela contagem de testes.
