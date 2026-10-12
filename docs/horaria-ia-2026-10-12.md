# Horária IA — núcleo compartilhado e cobrança pré-paga
Data: 12/10/2026

## O que foi implementado
- Área Ajuda: chatbot de suporte à utilização da Horária com respostas orientativas gratuitas e sem consumo de OpenAI.
- Backend autenticado `POST /api/ai/chat` com checagem de origem, tamanho de mensagens, empresa ativa e separação por empresa.
- Único núcleo de instruções e validação para `site` e futuro canal `whatsapp`, na camada `lib/horaria-ai-core.ts`. **Não existe webhook de WhatsApp IA ativado**.
- Adaptador para OpenAI Responses API com `gpt-6-luna`, `store:false`, limite de resposta e token secreto somente no servidor.
- Saldo pré-pago por empresa, reserva atômica de 1 unidade antes de chamar a OpenAI, liquidação ou reembolso, operação com Super Admin MFA para conceder créditos depois de conferir pagamento.
- O recurso pago fica DESLIGADO por padrão. Depende de chave, `HORARIA_AI_PAID_ENABLED=true`, `aiEnabled` da empresa e créditos disponíveis.
- Não são criados pagamentos, assinaturas, templates Meta, envios de WhatsApp ou cobranças reais.

## Política comercial proposta — não aplicada
- Básico R$49 e Pro R$80/mês: **inalterados**. IA paga não está incluída automaticamente.
- Adicional Horária IA sugerido a partir de R$99/mês, associado a suporte, manutenção e infraestrutura.
- As respostas com IA devem ser contratadas antecipadamente; referência ilustrativa: R$0,15 por unidade = 1 resposta, com pacotes/volumes a calibrar.
- WhatsApp: cobrança adicional separada das mensagens/templates Meta (preço varia por país, categoria e volume); **não está incluído na unidade de resposta**. Nenhum disparo automático habilitado.
- Essas tarifas não são cobradas pelo banco. O processamento de PIX ainda depende de confirmação manual; nunca creditar unidades por webhook não homologado.
- A API OpenAI é paga separadamente do ChatGPT Plus. Não é tecnicamente possível prometer custo operacional absoluto igual a zero, pois há hospedagem, provedores, impostos, câmbio, falhas de rede e eventuais tarifas externas.

## Como ativar futuramente
1. Conferir o preço comercial e a modalidade de crédito; obter pagamento confirmado do cliente **antes** da compra de créditos de provedor.
2. Pré-carregar saldo do provedor OpenAI com dinheiro já recebido e desativar recarga automática no provedor; monitorar saldo em dólares.
3. Registrar no Supabase as unidades contratadas por Super Admin autenticado com MFA: `select public.admin_add_ai_credits('<empresa-uuid>',100,'comprovante-unico-20261012');` (exemplo ilustrativo, **não executar com dados inventados**).
4. Verificar que a empresa está autorizada a usar IA e que as permissões no banco estão corretas.
5. Configurar na Vercel os secrets `HORARIA_OPENAI_API_KEY` e `SUPABASE_SERVICE_ROLE_KEY`; ativar `HORARIA_AI_PAID_ENABLED=true` somente depois dos testes.
6. Testar fluxo web com uma conta de homologação, créditos reais limitados e validação de pagamento; conferir custo por mensagem e idempotência. Não colocar chaves em `NEXT_PUBLIC_*`.
7. Para o WhatsApp, criar serviço separado para autenticar webhooks Meta, associar `phone_number_id` à empresa, verificar assinatura, fila, janela de 24h e cobrança de mensagens oficiais. **Não reutilizar o webhook existente de notificação como chatbot sem homologação**.

## Segurança e limitações
- O suporte gratuito é uma base de respostas, não um modelo GPT e não acessa dados sensíveis.
- O chat da assistência está disponível na interface para demonstração do estado, mas não responde com IA se não houver saldo, ativação e credenciais.
- Cada resposta de IA reserva uma unidade no banco ANTES de qualquer chamada paga; a liquidação é atômica e não repetível.
- O saldo não garante zero custo em caso de chamadas externas que sejam cobradas mesmo após falha/reembolso; tarifar com margem e usar limite de gastos no provedor.
- Por enquanto, sem histórico persistente de conversas e sem integrações com ferramentas que editem cadastros ou transmitam mensagens.
- Para informações de OS, cliente ou cobrança, o chatbot não consulta registros sigilosos; deve encaminhar para interfaces autorizadas e verificação de identidade.
- As regras de assinatura dos planos, PIX, limites 3/9 e permissões continuam as mesmas.
