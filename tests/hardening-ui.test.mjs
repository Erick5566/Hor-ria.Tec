import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("UI: contratos de autenticação, financeiro e papéis permanecem alinhados", async () => {
  const [
    authPage,
    recovery,
    adminModule,
    finance,
    orderDetail,
    agenda,
    modulePage,
    ordersList,
    repairBench,
  ] = await Promise.all([
    readFile("components/auth-page.tsx", "utf8"),
    readFile("components/password-recovery.tsx", "utf8"),
    readFile("components/admin-module.tsx", "utf8"),
    readFile("components/dashboard-finance.tsx", "utf8"),
    readFile("app/painel/ordens/[id]/page.tsx", "utf8"),
    readFile("app/painel/agenda/page.tsx", "utf8"),
    readFile("app/painel/[module]/page.tsx", "utf8"),
    readFile("components/orders-list.tsx", "utf8"),
    readFile("components/repair-bench.tsx", "utf8"),
  ]);

  const panelLayout = await readFile("app/painel/layout.tsx", "utf8");
  const adminLayout = await readFile("app/admin/layout.tsx", "utf8");
  const turnstileConfig = await readFile("lib/turnstile-config.ts", "utf8");

  assert.match(panelLayout, /reference-skin\.css/);
  assert.match(adminLayout, /reference-skin\.css/);
  assert.match(turnstileConfig, /0x4AAAAAAFKqY_KmjjTsBeEo/);

  for (const source of [authPage, recovery, adminModule]) {
    assert.doesNotMatch(source, /minLength=\{5\}/);
    assert.doesNotMatch(source, /minLength=\{6\}/);
    assert.match(source, /minLength=\{8\}/);
  }

  assert.match(authPage, /turnstileSiteKey/);
  assert.match(authPage, /verificação de segurança está ativa/);

  for (const days of [7, 15, 30, 60, 90]) {
    assert.match(finance, new RegExp(`<option value=\\{${days}\\}>`));
  }
  assert.doesNotMatch(finance, /<option value=\{14\}>/);

  assert.match(orderDetail, /canUseTechnical/);
  assert.match(orderDetail, /canViewFinance/);
  assert.match(orderDetail, /canViewFinance && tab === "Orçamento"/);
  assert.match(orderDetail, /canViewDeviceSecret=\{canUseTechnical\}/);
  assert.match(orderDetail, /item !== "Garantia" \|\| canUseTechnical/);
  assert.match(orderDetail, /canViewFinance && \(/);
  assert.match(orderDetail, /managerControlledStatuses/);
  assert.match(orderDetail, /quoteWaitingStatuses\.has\(order\.status\)/);
  assert.match(orderDetail, /Emitir NFS-e/);
  assert.match(agenda, /manager && blocking/);
  assert.match(modulePage, /stockOperationalModules/);
  assert.match(ordersList, /const canViewFinance/);
  assert.match(ordersList, /canViewFinance && <th>Valor<\/th>/);
  assert.match(ordersList, /canViewFinance && <option value="value">/);
  assert.match(repairBench, /managerControlledTargets/);
  assert.match(repairBench, /quoteWaitingStatuses/);
  assert.match(repairBench, /canMoveTo/);
});
