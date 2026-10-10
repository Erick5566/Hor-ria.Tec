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
4. Identificar/configurar o provedor PIX em sandbox. O produto atual usa PIX manual e um webhook genérico; não existe evidência de confirmação bancária automática funcionando.
5. Aprovar os testes críticos e só então publicar Production e verificar o domínio.

Nenhum deploy, alteração do banco produtivo, cobrança ou envio real de e-mail foi realizado nesta continuação. A correção está pronta para revisão; a homologação externa permanece bloqueada.
