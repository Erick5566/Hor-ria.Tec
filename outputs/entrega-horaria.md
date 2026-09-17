# Horaria — implementação e validação

Aplicação Next.js/React implementada no repositório atual e conectada ao projeto Supabase **Horária.tec**.

## Entregue

- Quatro migrations aplicadas no Supabase, com RLS desde a criação das tabelas.
- Autenticação por email/senha, configuração inicial transacional e serviços.
- Agenda diária/semanal, avanço de status e bloqueio/liberação de horários.
- Agendamento público em `/agendar/[slug]`, cálculo de disponibilidade no banco, dados do cliente e confirmação.
- Interface responsiva; nenhuma funcionalidade de pagamento.

## Verificação

- 12 testes automatizados de banco aprovados, incluindo isolamento entre empresas, permissões públicas, horários, status e rollback de configuração inválida.
- Teste transacional aprovado no banco remoto; todos os dados de teste revertidos.
- TypeScript aprovado e compilação de produção validada.
- Fluxo público completo verificado em navegador a 390 px, com banco PostgreSQL local descartável protegido por RLS.
- Tela inicial revisada no desktop.

O advisor registra avisos esperados sobre as duas funções públicas de catálogo/disponibilidade executadas com privilégios do criador. Elas não retornam informações de clientes. [Explicação do aviso no Supabase](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

## Usar

Com Node.js 22+ e pnpm, execute `pnpm dev` na raiz do repositório e abra http://localhost:3000. A conexão Supabase já está em `.env.local`, ignorado pelo Git. Crie sua conta, confirme o e-mail se solicitado, entre e configure sua empresa. O README da raiz contém a documentação técnica.

A confirmação por e-mail de uma conta real não foi executada pelo agente. Nenhum usuário ou agendamento fictício foi mantido no Supabase remoto. Não houve publicação em hospedagem externa.

Decisões da versão: uma agenda por empresa, fuso de Brasília, um expediente contínuo por dia, horários a cada 15 minutos e disponibilidade pública de até 90 dias.
