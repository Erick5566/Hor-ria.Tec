# Homologação da Horária — 10/10/2026

Base: `89f159b33af813de4c0c6e2f62008acb3160dedb`, repositório `Erick5566/Hor-ria.Tec`.
Destino autorizado: `pretovenicius196-1421/hor-ria-tec-fba1`, domínio `horaria.site`.

## Falha corrigida

A página `/conta-bloqueada` era estática e não relia o acesso após um pagamento confirmado ou uma reativação administrativa. O polling do Workspace deixa de existir quando o usuário é redirecionado para essa página.

O componente `BlockedAccessSync` consulta a RPC autenticada `access_context` ao abrir a página, a cada 15 segundos, ao voltar à aba e ao recuperar a conexão. Quando o contexto permite acesso, sincroniza a sessão SSR e retorna ao painel sem F5. A proteção de MFA do ADM permanece na rota de destino. Não libera uma empresa ainda suspensa/cancelada/em exclusão ou manutenção. Falhas de rede/validação mantêm o bloqueio, requisições simultâneas são deduplicadas e respostas após desmontar o componente são ignoradas.

Não altera valores, prazo de teste, tolerância, pagamentos ou dados existentes. Não implementa a detecção bancária de PIX.

## Testes acrescentados

- Cinco testes do componente: liberação, bloqueios/erros, aba oculta/offline, concorrência/desmontagem e retorno do Super Admin.
- Integração SQL isolada: vencimento efetivo → pagamento simulado aprovado → acesso ativo → uma notificação pendente → entregas duplicadas sem nova renovação.
- Teste de módulos ampliado: desativar e reativar pela RPC administrativa com MFA, reler como proprietário, verificar auditoria e preservação do serviço cadastrado.

Todos os dados de teste são criados em PGlite local. Não houve cobrança ou envio real de mensagens.

Validação final: `pnpm test` com **198/198 aprovados**, zero falhas/skips; `pnpm typecheck`, `pnpm build`, `git diff --check` aprovados; `node tests/runtime-smoke.mjs` com 21 rotas aprovadas. O smoke segue redirects e não certifica o painel autenticado.

## Evidências externas somente leitura

- Supabase `ijixyflyhiindirtqvxp`: migration remota `20261010021735_harden_billing_event_processing` registrada. A função privada publicada contém as proteções de idempotência, vínculo do pagamento com a empresa e preservação de suspensão administrativa. O relatório de 09/10 que dizia que a migration ainda não foi aplicada está desatualizado.
- Cron `horaria-admin-billing-email-alerts`: ativo a cada 10 minutos. Últimas três execuções consultadas (20:00, 20:10 e 20:20 UTC) bem-sucedidas.
- Fila de e-mails: dois eventos `payment_approved` e três `billing_grace_started` em `sent`. Isso é registro de envio, não confirmação na caixa de entrada.
- Realtime publicado para `empresas`, `assinaturas` e `pagamentos`. Configuração global não consta nessa publicação; o painel usa polling de segurança de 45 segundos para atualizar o contexto. Homologação entre navegadores continua pendente.
- `horaria.site/` e `/entrar` renderizam. Login desktop observado a 1363×936, com dimensões de documento iguais ao viewport, sem rolagem. O CAPTCHA não foi resolvido; não houve login no SaaS.
- Status do commit base no GitHub aponta sucesso em DOIS projetos Vercel: o autorizado `hor-ria-tec-fba1` e o antigo `hor-ria-tec` na conta `veniciuskiwify-9760s-projects`.

## Publicação e bloqueios

A integração Vercel com erro 403 não foi repetida. O navegador foi usado conforme autorizado, mas o login com Google retornou `502 Bad Gateway / Connection refused`, sem sessão confirmada.

Para guardar a correção no GitHub sem disparar deploy em outro projeto, `vercel.json` desativa deploys Git APENAS para a branch `fix/blocked-access-homologation-20261010`. As demais branches mantêm o comportamento existente. Referência: https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled.

Não mesclar nem publicar automaticamente esta branch antes de:

1. Obter sessão na Vercel e confirmar projeto, equipe, branch de produção, SHA e ambiente.
2. Publicar exclusivamente no projeto autorizado uma versão de teste usando configuração isolada, sem fixtures no banco produtivo.
3. Homologar acesso autenticado, bloqueio/liberação sem F5, módulos, e-mails e interface em celular/tablet/computador.
4. Validar o PIX manual: o ADM confere o recebimento no banco e confirma no painel; a confirmação deve liberar o acesso sem F5, preservar a idempotência e enfileirar a notificação. Por decisão do usuário em 10/10 às 21:15 (Brasília), integração bancária automática não é requisito de lançamento.
5. Aprovar os testes críticos e só então publicar Production e verificar o domínio.

Após abrir o PR #97, os status do GitHub revelaram uma integração antiga do Netlify, que publicou automaticamente um preview do primeiro commit. Não foi acionado nem utilizado como destino de homologação. Isso é um efeito externo indesejado; o preview anterior não foi removido. `netlify.toml` bloqueia novos builds Git do Netlify, e o título do PR/commit de contenção usa `[skip netlify]`. O vínculo antigo deve ser removido na plataforma antes de futuras publicações. Não houve deploy Vercel nesta continuação.

Nenhuma alteração do banco produtivo, cobrança ou envio real de e-mail foi realizado nesta continuação. A correção está pronta para revisão; a homologação externa permanece bloqueada.

## Atualização da homologação manual — 10/10, 21:15 (Brasília)

- Usuário configurou `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no ambiente Preview do projeto autorizado e republicou o commit `ded53b8`.
- Capturas confirmaram Preview, branch correta e renderização sem aviso de configuração do Supabase.
- Widget Turnstile inicialmente autorizava apenas `hor-ria-tec.vercel.app` e `horaria.site`. Usuário adicionou o alias específico da branch de homologação e relatou verificação com sucesso e login concluído. Login é evidência relatada pelo usuário; não houve inspeção do painel autenticado pelo agente.
- Preview usa o Supabase real: não executar confirmações fictícias, alterar vencimentos ou alternar módulos globais nesse banco para homologar.
- PIX permanece manual por decisão explícita do usuário. Confirmação bancária automática retirada dos critérios de lançamento; liberação automática após confirmação no ADM permanece obrigatória.
- Pendentes: homologação autenticada de bloqueio/liberação sem F5 com dados isolados, entrega dos e-mails, módulos e responsividade das telas internas. Production ainda não aprovada nesta tarefa.

## Atualização — 11/10 (Brasília)

Usuário confirmou manualmente bloqueio por vencimento, liberação sem F5 após PIX manual, recebimento dos e-mails, controles dos módulos e interface no computador. Essas aprovações são relatos do usuário, sem nova inspeção autenticada pelo agente. Celular e tablet foram adiados pelo usuário; publicação em Production permanece pendente.

As quatro capturas fornecidas pelo usuário foram adicionadas aos cartões de fone, celular, notebook e tablet no agendamento; imagem de Outros e comportamento de seleção preservados. Arquivos originais mantidos, incluindo fundos e elementos visíveis nas capturas. TypeScript e build aprovados após a troca.
