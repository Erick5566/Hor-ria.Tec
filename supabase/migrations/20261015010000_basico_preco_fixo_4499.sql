-- Plano Básico fixo: R$44,99 na contratação e em todas as renovações.
-- Preserva pagamentos já recebidos, datas de vencimento, bônus e o plano Plus.
BEGIN;
ALTER TABLE public.configuracoes_plataforma
  ALTER COLUMN initial_payment_amount SET DEFAULT 44.99;
ALTER TABLE public.configuracoes_plataforma
  ALTER COLUMN monthly_payment_amount SET DEFAULT 44.99;
UPDATE public.configuracoes_plataforma
SET initial_payment_amount = 44.99,
    monthly_payment_amount = 44.99
WHERE id IS TRUE
  AND (initial_payment_amount IS DISTINCT FROM 44.99
    OR monthly_payment_amount IS DISTINCT FROM 44.99);
COMMIT;
