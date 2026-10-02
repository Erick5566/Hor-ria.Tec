import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("auth: recuperação aponta para a rota correta e configuração local não exige confirmação", async () => {
  const recovery = await readFile("components/password-recovery.tsx", "utf8");
  const authPage = await readFile("components/auth-page.tsx", "utf8");
  const config = await readFile("supabase/config.toml", "utf8");
  const terms = await readFile("app/termos/page.tsx", "utf8");

  assert.match(
    recovery,
    /new URL\("\/redefinir-senha", window\.location\.origin\)\.toString\(\)/,
  );
  assert.doesNotMatch(recovery, /const redirectTo = location\.origin;/);

  assert.match(authPage, /minLength=\{6\}/);
  assert.match(recovery, /minLength=\{6\}/);
  assert.match(config, /enable_confirmations = false/);
  assert.match(
    config,
    /additional_redirect_urls = \["http:\/\/localhost:3000\/redefinir-senha"\]/,
  );

  assert.match(authPage, /name="legal" type="checkbox" required/);
  assert.match(authPage, /terms_accepted_at/);
  assert.match(authPage, /privacy_accepted_at/);
  assert.match(authPage, /"termos"/);
  assert.match(terms, /Termos de uso da Horária/);
});
