# WhatsApp Notifications

Worker para WhatsApp Business Cloud API. Nenhuma credencial fica no front-end ou nas migrations.

Configure os secrets `NOTIFICATION_WEBHOOK_SECRET`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_READY`, `WHATSAPP_TEMPLATE_QUOTE`, `PUBLIC_APP_URL` e, opcionalmente, `WHATSAPP_LANGUAGE_CODE`/`WHATSAPP_GRAPH_VERSION`.

Crie dois templates oficiais. O template de retirada recebe cliente, equipamento e link; o de orçamento recebe cliente, número da OS, total e link. Depois do deploy, crie um Database Webhook para `INSERT` em `public.notificacoes`, apontando para a função e enviando o header `x-horaria-webhook-secret`.

O banco gera uma chave única por evento. O worker reivindica apenas registros pendentes antes de chamar a API, evitando envio duplicado por concorrência.

## Aviso automático de reparo pronto (Horária Plus)

1. No recebimento da OS, o funcionário deve registrar o consentimento do cliente no campo **Avisar automaticamente quando estiver pronto**; o campo nunca vem marcado.
2. O disparo é criado somente quando a OS muda para **Pronto para retirada**, a assinatura ativa é `HORARIA_PRO`, o cliente autorizou o aviso e a função `whatsappEnabled` está ligada para a assistência.
3. O registro contém `readyConsent: true` e mantém a chave única por OS. Mensagens antigas sem essa autorização são rejeitadas pelo worker, sem chamada Meta. Antes de enviar, a função `validar_envio_whatsapp_pronto` (acesso exclusivo `service_role`) consulta novamente a autorização da OS, o plano, o canal, o status e o telefone atual.
4. Acompanhe os estados pendente, processando, enviada ou falhou diretamente na página da OS. Não envie manualmente ao mesmo tempo se o sistema estiver processando para evitar duplicidade.
5. A automação não utiliza o modelo de IA para redigir a mensagem; usa template oficial aprovado, reduzindo latência e custo de IA. O consentimento pode ser revogado via RPC mesmo após a OS ficar pronta.
6. A API oficial da Meta exige credenciais, templates aprovados e pode cobrar por mensagens. A autorização comercial e opt-in dos clientes são responsabilidades da assistência. Não ative `whatsappEnabled` nem envie mensagens reais durante homologação sem aprovação.

**Ordem de publicação segura (não executar até homologação):**
1. Confirmar o CI no commit exato e validar testes em banco efêmero isolado, sem credenciais Meta.
2. Aplicar **somente a migração aditiva** `20261012222500_recheck_plus_whatsapp_before_dispatch.sql`. Ela não envia mensagens; adiciona a validação protegida e impede a edição direta da coluna de consentimento.
3. Publicar o worker que usa `validar_envio_whatsapp_pronto`. O worker novo rejeita envios se a RPC ainda não estiver disponível (falha fechada), portanto **não inverter a ordem**.
4. Verificar o site e a branch correta de produção na Vercel. Publicar o front-end apenas após o banco e o worker serem validados.
5. Manter `whatsappEnabled` desativado e testar apenas com dublês de rede e dados fictícios isolados. Ativar o canal real é uma etapa comercial separada, com consentimento verificável, templates aprovados e autorização explícita.

**Não aplicar novamente a migração do PR #111** se ela já constar do histórico do Supabase. Não executar disparos nem modificar notificações legadas de clientes durante a homologação.
