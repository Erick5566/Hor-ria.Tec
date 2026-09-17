# Análise prévia — evolução da Horária

Análise realizada antes de alterar código da aplicação.

## Arquitetura existente

- Next.js 16.3.5, React 19.3.0, TypeScript estrito, App Router; pnpm e lockfile existentes.
- `app/page.tsx`: login/cadastro Supabase por email e senha.
- `app/painel/page.tsx`: autenticação do dono, configuração inicial, agenda diária/semanal, status e bloqueios.
- `app/agendar/[slug]/page.tsx`: catálogo, disponibilidade, reserva pública e confirmação.
- `components/brand.tsx`: marca e orientação quando falta configuração.
- `components/setup.tsx`: cadastro transacional de empresa, expediente e serviços.
- `lib/supabase.ts`: clientes autenticado/anônimo, tipos e utilitários de data.
- `app/globals.css`: CSS global responsivo, sem biblioteca de componentes; paleta verde a substituir.
- Quatro migrations com RLS, chaves compostas e exclusão de sobreposição; testes em PostgreSQL embarcado e SQL transacional remoto.
- Supabase remoto: 1 empresa, 2 serviços, 1 agendamento; nenhum bucket existente. Sem tabelas de clientes, equipamentos, OS ou financeiro.
- Sem ORM, API própria, armazenamento local de negócio ou dependência de hospedagem específica. Next.js permanece compatível com Vercel.
- Diretório atual não contém `.git`; não é possível registrar commits locais sem inicializar um repositório. Nenhum projeto novo será criado.

## Reutilização e evolução

Preservar login, setup, clientes Supabase, regras de disponibilidade, bloqueios e rota pública existente. Extrair shell compartilhado e contexto da empresa. Dashboard será `/painel`; agenda permanece acessível em `/painel/agenda`. Adicionar módulos e componentes especializados dentro do mesmo projeto.

Modelo aditivo: clientes → equipamentos → ordens → diagnóstico/orçamento/fotos/histórico/financeiro. Todas as relações carregam empresa_id e validam tenant por RLS e chaves compostas. Não apagar ou transformar registros legados em dados inventados.

Fotos: Supabase Storage privado, uploads com nomes únicos e sem upsert; guardar caminho/URL persistente, categoria, observação, autor, data e OS. URLs assinadas apenas para visualização. Cliente público usa solicitação limitada e acesso restrito; nunca terá leitura geral dos arquivos ou tabelas internas.

Consulta de reparo: número público não sequencial e telefone normalizado, retorno mínimo. Número interno sequencial continua visível para operação. Nenhuma senha, CPF, observação interna ou foto privada será publicada na consulta.

## Validação inicial

TypeScript, build e 12 testes existentes aprovados antes das alterações. Novas etapas terão registro próprio de build, TypeScript e verificações de execução. Nenhuma informação fictícia será usada nos dashboards.

## Sequência

1. Identidade e shell; 2. Dashboard e fundação de dados; 3. OS; 4. Clientes/equipamentos; 5. Fotos; 6. Diagnóstico; 7. Orçamento; 8. Histórico; 9. Agenda; 10. Portal público; 11. Mobile; 12. Revisão e documentação.
