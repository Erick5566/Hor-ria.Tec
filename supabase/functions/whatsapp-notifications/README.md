# WhatsApp Notifications

Worker para WhatsApp Business Cloud API. Nenhuma credencial fica no front-end ou nas migrations.

Configure os secrets `NOTIFICATION_WEBHOOK_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_READY`, `WHATSAPP_TEMPLATE_QUOTE`, `PUBLIC_APP_URL` e, opcionalmente, `WHATSAPP_LANGUAGE_CODE`/`WHATSAPP_GRAPH_VERSION`.

Crie dois templates oficiais. O template de retirada recebe cliente, equipamento e link; o de orçamento recebe cliente, número da OS, total e link. Depois do deploy, crie um Database Webhook para `INSERT` em `public.notificacoes`, apontando para a função e enviando o header `x-horaria-webhook-secret`.

O banco gera uma chave única por evento. O worker reivindica apenas registros pendentes antes de chamar a API, evitando envio duplicado por concorrência.

## Aviso automático de reparo pronto (Horária Plus)

1. No recebimento da OS, o funcionário deve registrar o consentimento do cliente no campo **Avisar automaticamente quando estiver pronto**; o campo nunca vem marcado.
2. O disparo é criado somente quando a OS muda para **Pronto para retirada**, a assinatura ativa é `HORARIA_PRO`, o cliente autorizou o aviso e a função `whatsappEnabled` está ligada para a assistência.
3. O registro contém `readyConsent: true` e mantém a chave única por OS. Mensagens antigas sem essa autorização são rejeitadas pelo worker, sem chamada Meta.
4. Acompanhe os estados pendente, processando, enviada ou falhou diretamente na página da OS. Não envie manualmente ao mesmo tempo se o sistema estiver processando para evitar duplicidade.
5. O worker precisa ser publicado com esta versão antes de liberar o disparo no banco. A automação não utiliza o modelo de IA para redigir a mensagem; usa template oficial aprovado, reduzindo latência e custo de IA.
6. A API oficial da Meta exige credenciais, templates aprovados e pode cobrar por mensagens. A autorização comercial e opt-in dos clientes são responsabilidades da assistência. Não ative `whatsappEnabled` nem envie mensagens reais durante homologação sem aprovação.

**Ordem de publicação:** migração SQL, worker atualizado, front-end e teste controlado de 1 OS fictícia em ambiente separado. Não publicar somente a migração com um worker antigo, pois notificações antigas não tinham opt-in explícito.
