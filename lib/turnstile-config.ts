// Cloudflare Turnstile site keys are public by design.
// Keep the env override for portability, but retain the Horária production
// key as a safe fallback so auth/booking do not silently lose CAPTCHA after
// a hosting-account migration.
export const turnstileSiteKey =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
  "0x4AAAAAAFKqY_KmjjTsBeEo";
