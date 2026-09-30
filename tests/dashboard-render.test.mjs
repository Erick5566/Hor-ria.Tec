import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
function render(data, { loading = false, error = "" } = {}) {
  const states = [data, loading, error, "todos"];
  let index = 0;
  const modules = new Map();
  const mocks = {
    react: {
      ...React,
      useState: () => [states[index++], () => {}],
      useEffect: () => {},
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
      useRef: (value) => ({ current: value }),
    },
    "@/components/workspace": {
      useWorkspace: () => ({
        empresa: { id: "test", nome: "Teste" },
        periodStart: "2026-09-29",
        periodEnd: "2026-09-29",
      }),
    },
    "@/lib/supabase": {
      supabase: null,
      message: (e) => e.message,
      time: () => "09:00",
    },
    "next/link": {
      __esModule: true,
      default: ({ children, ...props }) =>
        React.createElement("a", props, children),
    },
  };
  function load(name, parent = process.cwd()) {
    if (mocks[name]) return mocks[name];
    if (
      !name.startsWith("@/") &&
      !name.startsWith(".") &&
      !name.startsWith("/")
    )
      return require(name);
    const base = name.startsWith("@/")
      ? resolve(name.slice(2))
      : resolve(parent, name);
    const file = [base, base + ".ts", base + ".tsx"].find(existsSync);
    if (modules.has(file)) return modules.get(file);
    const exports = {};
    modules.set(file, exports);
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInNewContext(compiled, {
      exports,
      require: (n) => load(n, resolve(file, "..")),
      Intl,
      Date,
      AbortController,
      console,
      process: { env: {} },
    });
    return exports;
  }
  const Overview = load(resolve("app/painel/page.tsx")).default;
  return renderToStaticMarkup(React.createElement(Overview));
}
const fixture = () => ({
  metrics: {},
  spark: {},
  status: {
    concluidas: 0,
    andamento: 0,
    pecas: 0,
    orcamento: 0,
    canceladas: 0,
    outros: 0,
  },
  performance: { completionRate: 0, averageRepairDays: null },
  trend: [],
  latestOrders: [],
  todayAgenda: [],
  priorities: [],
});
test("painel renderizado: vazio amigável e sem total fictício no donut", () => {
  const html = render(fixture());
  assert.match(html, /Nenhuma ordem no período selecionado/);
  assert.match(html, /Nenhuma ordem para este status no período/);
  assert.doesNotMatch(html, /dashboard-status-donut/);
});
test("painel renderizado: dia único sem bolinhas, badges e atrasos", () => {
  const data = fixture();
  data.trend = [{ key: "2026-09-29", opened: 1, active: 0, finalized: 0 }];
  data.status.andamento = 1;
  data.latestOrders = [
    {
      id: "test-order",
      numero: 1001,
      status: "novo",
      prioridade: "urgente",
      prazo_previsto: "2020-01-01",
      criado_em: "2026-09-29T12:00:00Z",
      cliente_nome: "Teste",
      equipamento_modelo: "Notebook",
    },
  ];
  data.todayAgenda = [
    {
      id: "test-booking",
      inicio: "2020-01-01T12:00:00Z",
      status: "aguardando",
      prioridade: "alta",
      nome_cliente: "Teste",
      descricao: "Diagnóstico",
    },
  ];
  const html = render(data);
  assert.match(html, /points="462,20 472,20"/);
  assert.doesNotMatch(html, /dash-point/);
  assert.match(html, /dashboard-priority-badge urgente/);
  assert.match(html, /dashboard-priority-badge alta/);
  assert.match(html, /dashboard-overdue/);
  assert.match(html, /Atrasada/);
  assert.match(html, /Atrasado/);
});
test("painel renderizado: loading e falha não se apresentam como listas vazias", () => {
  const loading = render(null, { loading: true });
  assert.match(loading, /Carregando dados/);
  assert.doesNotMatch(loading, /Nenhum atendimento hoje/);
  const failed = render(null, { error: "Falha de conexão" });
  assert.match(failed, /Falha de conexão/);
  assert.match(failed, /Tentar novamente/);
  assert.doesNotMatch(failed, /Nenhuma ordem cadastrada/);
});
test("painel renderizado: falha de atualização preserva dados anteriores", () => {
  const html = render(fixture(), { error: "Falha de conexão" });
  assert.match(html, /Exibindo os últimos dados/);
  assert.match(html, /Desempenho da assistência/);
});

test("cards superiores renderizados: movimento do período vira curva; zero mostra estado vazio", () => {
  const data = fixture();
  data.spark = {
    orders: [0, 3, 0],
    active: [0, 3, 0],
    clients: [0, 3, 0],
    finished: [0, 0, 0],
    parts: [0, 0, 0],
    revenue: [0, 0, 0],
  };
  const html = render(data);
  assert.match(html, /Evolução diária: Ordens de serviço/);
  assert.match(html, /Evolução diária: Novos clientes/);
  assert.equal((html.match(/class="kpi-trend-v2-line"/g) || []).length, 3);
  assert.equal((html.match(/class="kpi-trend-empty"/g) || []).length, 3);
});

test("região de evolução: um gráfico com quatro linhas de cores e legenda próprias", () => {
  const data = fixture();
  data.trend = [
    {
      key: "2026-09-29",
      opened: 4,
      active: 2,
      finalized: 0,
      ready: 1,
      parts: 1,
    },
  ];
  const html = render(data);
  assert.equal((html.match(/<figure/g) || []).length, 1);
  for (const label of [
    "Abertas",
    "Em andamento",
    "Pronto para retirada",
    "Aguardando peças",
  ])
    assert.match(html, new RegExp(`aria-label="${label}"`));
  assert.equal((html.match(/class="dashboard-series-line"/g) || []).length, 4);
  for (const color of ["#7c3aed", "#2563eb", "#16a34a", "#d97706"])
    assert.ok(html.includes(color));
});

test("evolução: eixos mostram todos os dias do mês e quantidades sem bolinhas", () => {
  const data = fixture();
  data.trend = Array.from({ length: 29 }, (_, index) => ({
    key: `2026-09-${String(index + 1).padStart(2, "0")}`,
    opened: index === 14 ? 3 : 0,
    active: 0,
    finalized: 0,
    parts: 0,
  }));
  const html = render(data);
  assert.match(html, /M44 20 V216 H890/);
  assert.match(html, /text-anchor="middle">30</);
  assert.match(html, /text-anchor="end">3</);
  assert.doesNotMatch(html, /dash-point/);
});
