# Horária IA — operações administrativas (somente leitura)

## Disponibilidade
- Novo caminho **/admin/ia** no menu lateral do Super Admin.
- Proteção em duas camadas: layout/page do Next.js exigem login, cargo Super Admin e MFA `aal2`; a função `admin_ai_overview()` verifica tudo novamente no Postgres.
- Visão consolidada por empresa, contendo exclusivamente nome, slug, status, saldo de unidades de IA, consumo e contagem de reservas. Não consulta fotos, OS, clientes, mensagens, comprovantes ou chaves.

## Alertas
- Reservas que tiveram chamada externa iniciada podem ter custo mesmo com timeout.
- *Revisão necessária* conta chamadas externas iniciadas com reserva há mais de dez minutos.
- Não há botão para devolver a unidade: conciliação depende de conferir os logs e as cobranças efetivas do provedor.
- A listagem é limitada a 150 empresas com histórico/carteira e 60 reservas mais antigas por carregamento. Os cartões mostram totais globais, inclusive registros além da limitação.
- Saldo é apresentado em *unidades de resposta*, não em reais. Não equivale ao gasto exato no fornecedor.

## Política de lançamento
- Esta entrega **não** cria pagamentos, créditos ou cobrança de assinatura.
- **Não habilitar** `HORARIA_AI_PAID_ENABLED` nem cadastrar chave OpenAI sem aprovação comercial e orçamento de testes.
- Aplicar `supabase/migrations/20261012163000_admin_ai_readonly_overview.sql` ANTES de publicar a página.
- Testar com Super Admin em sessão MFA; verificar que usuário comum e Super Admin com MFA pendente não conseguem consultar.
- Não fazer deploy enquanto a quota Vercel não permitir, nem promover preview com env diferentes de production.

## Próximos passos
- Acompanhar conciliação somente leitura e elaborar fluxo administrativo auditado de liquidação/reembolso **após** documentação de evidências, antes de permitir uma ação financeira.
- Homologar visão com duas fotografias de teste autorizadas e medir o consumo real.
