# Admin Billing Email

Envia alertas administrativos de cobrança para `horariaagenda@gmail.com`.

Eventos:
- `billing_grace_started`: a assinatura venceu e entrou nas 24 horas de tolerância.
- `payment_approved`: um pagamento foi confirmado, manualmente ou por webhook.

O banco mantém uma fila idempotente em `public.admin_email_notifications`.
O cron `horaria-admin-billing-email-alerts` verifica a cada 10 minutos novas contas em tolerância e reenvia notificações pendentes/falhas.

A Edge Function usa a API HTTP do Resend.

Secrets necessários no Supabase:
- `RESEND_API_KEY`
- `ADMIN_EMAIL_FROM` (opcional). Se ausente, usa `Horária <onboarding@resend.dev>`.

Enquanto `RESEND_API_KEY` não estiver configurada, os alertas permanecem com status `pending` e são tentados novamente pelo cron. Nenhuma chave fica no frontend ou no banco.

O worker valida `dispatch_token` único por notificação antes de reivindicar a fila e usa `Idempotency-Key` no Resend para evitar mensagens duplicadas.
