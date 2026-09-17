# WhatsApp Notifications

Worker para WhatsApp Business Cloud API. Nenhuma credencial fica no front-end ou nas migrations.

Configure os secrets `NOTIFICATION_WEBHOOK_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_READY`, `WHATSAPP_TEMPLATE_QUOTE`, `PUBLIC_APP_URL` e, opcionalmente, `WHATSAPP_LANGUAGE_CODE`/`WHATSAPP_GRAPH_VERSION`.

Crie dois templates oficiais. O template de retirada recebe cliente, equipamento e link; o de orçamento recebe cliente, número da OS, total e link. Depois do deploy, crie um Database Webhook para `INSERT` em `public.notificacoes`, apontando para a função e enviando o header `x-horaria-webhook-secret`.

O banco gera uma chave única por evento. O worker reivindica apenas registros pendentes antes de chamar a API, evitando envio duplicado por concorrência.
