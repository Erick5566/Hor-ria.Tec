# Horária — Security baseline

This repository uses Supabase Auth, PostgreSQL RLS, Storage policies and explicit
RPC grants for tenant isolation.

## Rules

- Never commit service-role, billing, WhatsApp or SMTP credentials.
- Browser code may use only the Supabase public/anon key.
- Every tenant-owned table must keep RLS enabled and scope access by company.
- Internal SECURITY DEFINER RPCs must not be executable by the anon role.
- Public SECURITY DEFINER RPCs must return only intentionally public data and
  validate all identifiers/tokens server-side.
- Billing state is changed only from an authenticated provider webhook.
- Public uploads require a short-lived upload ticket.
- Protected/admin routes are no-store and receive security headers.

## Before production sales

- Enable leaked-password protection in Supabase Auth.
- Public booking is routed through the `public-booking` Edge Function, which
  enforces IP/tenant rate limiting before the database call. A database flood
  guard and the per-phone daily limit remain as additional layers.
- Cloudflare Turnstile support is already implemented in the Edge Function and
  becomes mandatory automatically when `TURNSTILE_SECRET_KEY` is configured.
  The browser widget/site key must be configured at the same time.
- Enable CAPTCHA/rate-limit protection for login/signup in Supabase Auth.
- Enable MFA for SUPER_ADMIN.
- Confirm automated database backups and perform a restore test.
- Configure the final Kiwify webhook verification method from Kiwify's current
  official documentation before treating billing as production-ready.
- Configure transactional email with SPF, DKIM and DMARC if booking confirmation
  by email is promised.
- Run supabase/tests/tenant_isolation.sql and
  supabase/tests/security_surface.sql after permission changes.
