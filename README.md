# Horária

Micro-SaaS de gestão para assistência técnica, construído com Next.js 16, React 19, TypeScript e Supabase. O projeto cobre o ciclo de cliente, equipamento, entrada, ordem de serviço, diagnóstico, orçamento, aprovação, reparo, testes, retirada e finalização.

## Executar

Requer Node.js 22+ e pnpm.

1. Execute `pnpm install`.
2. Copie `.env.example` para `.env.local` e informe `NEXT_PUBLIC_SUPABASE_URL` e a chave pública anon/publishable. Nunca use `service_role` no navegador.
3. Aplique as migrations em `supabase/migrations`, na ordem dos nomes. Neste checkout elas já estão sincronizadas com o projeto Supabase integrado.
4. No Supabase Auth, habilite email/senha e configure a Site URL para a origem da aplicação.
5. Execute `pnpm dev` e abra http://localhost:3000.

Para produção, use `pnpm build` e `pnpm start`. A aplicação usa somente recursos compatíveis com Vercel.

## Módulos

- Dashboard com indicadores reais, últimas ordens, próximos atendimentos, equipamentos, serviços e resumo financeiro.
- Ordens de serviço com cliente, equipamento, checklist de entrada, senha restrita, técnico, previsão e 13 estados operacionais.
- Fotos privadas no Supabase Storage, câmera/galeria, múltiplos arquivos, categorias, observações e histórico imutável.
- Diagnóstico técnico interno, peças aplicadas com baixa atômica de estoque e trilha de auditoria.
- Orçamentos versionados com serviços, peças, mão de obra, desconto, validade e resposta pública.
- Clientes e equipamentos com histórico de ordens, orçamentos, fotos e peças aplicadas.
- Agenda em dia, semana e mês, bloqueios e atendimentos vinculados à OS.
- Serviços, estoque, financeiro e relatórios com exportação CSV.
- Página pública em `/[slug]`, agendamento legado em `/agendar/[slug]` e acompanhamento em `/acompanhar`.

## Segurança

Todas as tabelas operacionais usam RLS. O tenant é validado por `empresa_id`, políticas, chaves estrangeiras compostas e funções transacionais. Uma empresa não consegue selecionar ou alterar dados de outra.

A página pública não recebe leitura direta de clientes, equipamentos, ordens, fotos, diagnóstico ou financeiro. As RPCs públicas retornam projeções mínimas. O acompanhamento exige um código aleatório de 16 caracteres e o telefone do cliente. Senha do aparelho, diagnóstico, observações internas e fotos privadas não entram na resposta.

O bucket `os-fotos` é privado. Uploads têm caminhos únicos, autorização por dono ou ticket temporário, limite de tamanho e não permitem sobrescrita ou exclusão pela aplicação. URLs assinadas são emitidas apenas para o dono autenticado.

As funções elevadas usam `search_path` vazio, validações explícitas e privilégios revogados por padrão. Os avisos do Advisor sobre RPCs `SECURITY DEFINER` públicas são esperados: catálogo, horários, solicitação, foto, acompanhamento e resposta ao orçamento precisam operar sem login, mas cada função publica ou altera somente a projeção autorizada. A tabela privada de tickets não possui política deliberadamente; nenhum papel de API tem privilégio direto nela.

## Administração da plataforma

`/admin` é uma área privada para o papel `SUPER_ADMIN`. Ela permite acompanhar empresas e assinaturas, suspender ou reativar contas, ativar manutenção global ou por empresa, limitar novos cadastros e controlar recursos. As operações administrativas passam por RPCs protegidas e geram auditoria; o administrador da plataforma não recebe leitura direta das tabelas operacionais das assistências.

O cadastro cria perfil, empresa, vínculo `OWNER` e assinatura de teste de 7 dias em uma única operação no banco. Cancelamentos preservam os dados por 30 dias antes da data programada de exclusão.

O endpoint `/api/webhooks/billing/[provider]` fica inativo até que `HORARIA_BILLING_PROVIDER`, `HORARIA_BILLING_WEBHOOK_SECRET` e `SUPABASE_SERVICE_ROLE_KEY` estejam configuradas no servidor. A assinatura HMAC usa o cabeçalho `x-horaria-signature`, e cada evento possui uma chave idempotente. A chave `service_role` nunca deve ser exposta no navegador.

## Validação

- `pnpm test`: aplica todas as migrations em PostgreSQL embarcado e valida RLS, vínculos de tenant, agenda, fotos, orçamento, portal, estoque e transições operacionais.
- `pnpm typecheck`: verifica TypeScript.
- `pnpm build`: gera a build de produção.
- `node tests/runtime-smoke.mjs`: sobe a build e verifica as rotas essenciais por HTTP.
- `tests/remote-isolation.sql`: valida isolamento no Supabase real e termina com `ROLLBACK`, sem deixar fixtures.

A autenticação por e-mail real depende da configuração de confirmação e entrega de e-mail do projeto Supabase. O gateway de cobrança está preparado, mas só processa pagamentos quando um provedor e suas credenciais forem configurados. Emissão fiscal e envio automático de WhatsApp/SMS não fazem parte desta versão.

Referências: [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control), [Next.js App Router](https://nextjs.org/docs/app/getting-started/installation).
