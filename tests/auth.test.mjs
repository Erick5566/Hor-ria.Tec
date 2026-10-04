import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("auth: recuperação aponta para a rota correta e configuração local não exige confirmação", async () => {
  const recovery = await readFile("components/password-recovery.tsx", "utf8");
  const authPage = await readFile("components/auth-page.tsx", "utf8");
  const config = await readFile("supabase/config.toml", "utf8");
  const terms = await readFile("app/termos/page.tsx", "utf8");
  const setup = await readFile("components/setup.tsx", "utf8");
  const authStyles = await readFile("app/home.module.css", "utf8");
  const globalStyles = await readFile("app/globals.css", "utf8");
  const publicPageSettings = await readFile(
    "components/public-page-settings.tsx",
    "utf8",
  );
  const slugMigration = await readFile(
    "supabase/migrations/20261002033000_reserve_terms_slug.sql",
    "utf8",
  );

  assert.match(
    recovery,
    /new URL\("\/redefinir-senha", window\.location\.origin\)\.toString\(\)/,
  );
  assert.doesNotMatch(recovery, /const redirectTo = location\.origin;/);

  assert.match(authPage, /minLength=\{8\}/);
  assert.match(recovery, /minLength=\{8\}/);
  assert.match(config, /enable_confirmations = false/);
  assert.match(
    config,
    /additional_redirect_urls = \["http:\/\/localhost:3000\/redefinir-senha"\]/,
  );

  assert.match(authPage, /name="legal" type="checkbox" required/);
  assert.match(authPage, /terms_accepted_at/);
  assert.match(authPage, /privacy_accepted_at/);
  assert.match(authPage, /terms_version: TERMS_VERSION/);
  assert.match(authPage, /privacy_version: PRIVACY_VERSION/);
  assert.match(authPage, /const TERMS_VERSION = "2026-10-01"/);
  assert.match(authPage, /const PRIVACY_VERSION = "2026-09-20"/);
  assert.match(authPage, /"termos"/);
  assert.match(setup, /"termos"/);
  assert.match(publicPageSettings, /"termos"/);
  assert.match(slugMigration, /check \(slug <> 'termos'\)/);
  assert.match(slugMigration, /'privacidade','termos'/);
  assert.match(terms, /Termos de uso da Horária/);
  assert.match(authStyles, /Mobile auth inputs stay readable/);
  assert.match(authStyles, /\.authViewport \.authInput,[\s\S]*\.signupViewport \.authInput[\s\S]*font-size: 16px/);
  assert.match(globalStyles, /Password recovery inputs match mobile auth readability/);
  assert.match(globalStyles, /\.auth-simple-card input,[\s\S]*font-size: 16px/);
});
