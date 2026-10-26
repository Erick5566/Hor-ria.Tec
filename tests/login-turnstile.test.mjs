import { test } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { readFile } from "node:fs/promises";

const source = await readFile("lib/turnstile-errors.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
});
const { turnstileErrorMessage } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`
);

test("turnstile: diferencia domínio não autorizado de falha de rede", () => {
  assert.match(turnstileErrorMessage("110200"), /não está autorizado/);
  assert.match(turnstileErrorMessage("200500"), /conexão/);
  assert.match(turnstileErrorMessage("110620"), /expirou/);
  assert.match(turnstileErrorMessage("999999"), /Tente novamente/);
});

test("login: mensagens de autenticação e recuperação ficam disponíveis", async () => {
  const page = await readFile("components/auth-page.tsx", "utf8");
  assert.match(page, /invalid_credentials/);
  assert.match(page, /E-mail ou senha incorretos/);
  assert.match(page, /Esqueci minha senha/);
  assert.match(page, /onError=\{onCaptchaError\}/);
  assert.match(page, /Tentar verificação novamente/);
  // CAPTCHA permanece obrigatório antes de tentar enviar as credenciais.
  assert.match(page, /turnstileSiteKey && !captchaToken/);
});
