// Render production components with synthetic data; no accounts or payments are touched.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const date = "2026-10-11";
const longName =
  "Assistência técnica especializada em celulares, notebooks e eletrodomésticos";
const flags = Object.fromEntries(
  [
    "dashboard",
    "orders",
    "quotes",
    "appointments",
    "customers",
    "stock",
    "sales",
    "devices",
    "usedDevices",
    "showcase",
    "afterSales",
    "services",
    "financial",
    "fiscal",
    "team",
    "business",
    "publicPage",
    "settings",
    "support",
  ].map((key) => [key + "Enabled", true]),
);
const empresa = {
  id: "fixture",
  nome: longName,
  slug: "assistencia-teste",
  horario: {
    "Segunda-feira": ["08:00", "18:00"],
    "Terça-feira": ["08:00", "18:00"],
  },
  aparencia: {},
  pagina: {
    servicos_destaque: [],
    ordem_secoes: ["como_funciona", "servicos", "vitrine", "contato"],
    mostrar_servicos: true,
    mostrar_contato: true,
    mostrar_agendamento: true,
    mostrar_como_funciona: true,
    mostrar_endereco: true,
    mostrar_horario: true,
    mostrar_whatsapp: true,
  },
  telefone: "+5585999999999",
  whatsapp: "+5585999999999",
  email: "contato-muito-longo@assistencia-exemplo.invalid",
  endereco: "Rua das Assistências Técnicas, 123",
  cidade: "Fortaleza",
  estado: "CE",
  prazo_resposta_horas: 4,
};
const context = {
  empresa,
  userId: "fixture",
  email: empresa.email,
  access: {
    authenticated: true,
    isSuperAdmin: false,
    globalMaintenance: false,
    company: {
      id: empresa.id,
      slug: empresa.slug,
      status: "ACTIVE",
      role: "OWNER",
      featureFlags: flags,
    },
  },
  periodStart: "2026-10-01",
  periodEnd: date,
  selectedMonth: "2026-10",
  refresh: async () => {},
  setPeriod: () => {},
  setSelectedMonth: () => {},
};
const order = {
  id: "order",
  empresa_id: empresa.id,
  numero: 1027,
  status: "em_reparo",
  prioridade: "normal",
  problema: "Tela quebrada e falha de carregamento com diagnóstico e orçamento",
  criado_em: date + "T12:00:00Z",
  cliente_nome: "Cliente com nome e sobrenomes muito extensos",
  cliente_whatsapp: empresa.whatsapp,
  equipamento_marca: "Apple",
  equipamento_modelo: "iPhone 17 Pro Max",
  tecnico: "Técnico responsável",
  entrada_confirmada: true,
  quote_total: 1234.56,
};
const client = {
  id: "client",
  empresa_id: empresa.id,
  nome: order.cliente_nome,
  whatsapp: empresa.whatsapp,
  email: empresa.email,
  equipment_count: 2,
  service_count: 3,
  relationship_total: 1234.56,
  criado_em: date + "T12:00:00Z",
};
const entry = {
  id: "entry",
  empresa_id: empresa.id,
  descricao: "Manutenção completa com substituição de componentes e acessórios",
  tipo: "receita",
  valor: 1234.56,
  status: "pago",
  vencimento: date,
  pago_em: date + "T12:00:00Z",
  origem: "manual",
};
const dashboard = {
  metrics: {},
  spark: { orders: [0, 3, 1], active: [1, 2, 3] },
  status: {
    concluidas: 1,
    andamento: 1,
    pecas: 1,
    orcamento: 1,
    canceladas: 0,
    outros: 0,
  },
  performance: { completionRate: 35, averageRepairDays: 2 },
  trend: Array.from({ length: 30 }, (_, i) => ({
    key: `2026-10-${String(i + 1).padStart(2, "0")}`,
    opened: i % 4,
    active: i % 3,
    finalized: i % 2,
  })),
  latestOrders: [order],
  todayAgenda: [],
  priorities: [],
  serviceChart: {
    bookings: 2,
    opened: 3,
    active: 4,
    parts: 1,
    ready: 2,
    finished: 1,
  },
};
const billing = {
  receivedThisMonth: 12345.67,
  receivedTotal: 98765.43,
  expensesThisMonth: 50,
  expensesTotal: 100,
  netThisMonth: 12295.67,
  receivableTotal: 300,
  overdueCount: 1,
  pendingCount: 2,
  dueNext24hCount: 1,
  activeSubscriptions: 10,
  trialSubscriptions: 2,
  suspendedCount: 0,
  estimatedMrr: 490,
  graceHours: 24,
};
const companies = Array.from({ length: 3 }, (_, i) => ({
  id: String(i),
  name: longName,
  slug: "assistencia-" + i,
  responsible: client.nome,
  email: empresa.email,
  createdAt: date + "T12:00:00Z",
  lastAccessAt: null,
  status: "TRIAL",
  usersCount: 1,
  customersCount: 2,
  ordersCount: 3,
  storageBytes: 0,
}));

export async function renderFixture(
  component,
  props = {},
  overrides = {},
  shell = "panel",
) {
  const cache = new Map();
  const mappings = {};
  const styles = readFileSync("app/home.module.css", "utf8");
  for (const match of styles.matchAll(/\.([a-zA-Z][\w-]*)/g))
    mappings[match[1]] = "home-" + match[1];
  let compiledCss = "";
  if (process.env.RESPONSIVE_COMPILED_CSS === "1") {
    const route =
      shell === "panel"
        ? "/painel/page"
        : shell === "admin"
          ? "/admin/page"
          : "/page";
    const manifestFile = resolve(
      `.next/server/app${route}_client-reference-manifest.js`,
    );
    require(manifestFile);
    const entries = globalThis.__RSC_MANIFEST[route].entryCSSFiles;
    const keys = [
      resolve("app/layout"),
      ...(shell === "panel" || shell === "admin"
        ? [resolve(`app/${shell === "panel" ? "painel" : "admin"}/layout`)]
        : []),
      resolve("app/page"),
    ];
    const paths = [
      ...new Set(
        keys.flatMap((key) => (entries[key] || []).map((file) => file.path)),
      ),
    ];
    compiledCss = paths
      .map((path) => readFileSync(resolve(".next", path), "utf8"))
      .join("\n");
    for (const match of compiledCss.matchAll(/\.home_(\w+?)__([\w-]+)/g))
      mappings[match[1]] = `home_${match[1]}__${match[2]}`;
  }
  const link = ({ children, prefetch, ...props }) =>
    React.createElement("a", props, children);
  const mocks = {
    "next/link": { __esModule: true, default: link },
    "next/image": {
      __esModule: true,
      default: ({ unoptimized, priority, ...props }) =>
        React.createElement("img", props),
    },
    "next/navigation": {
      usePathname: () => (shell === "admin" ? "/admin" : "/painel"),
      useSearchParams: () => new URLSearchParams(),
      useRouter: () => ({
        push() {},
        replace() {},
        refresh() {},
        prefetch() {},
      }),
    },
    "next/dynamic": {
      __esModule: true,
      default: (_, options) => options?.loading || (() => null),
    },
    "@/app/home.module.css": { __esModule: true, default: mappings },
    "@/lib/supabase": {
      supabase: null,
      publicDb: null,
      configured: true,
      today: () => date,
      time: () => "09:00",
      dateLabel: () => "11 de outubro",
      shift: () => "2026-10-20",
      localDateInput: () => date,
      message: (error) => error?.message || "",
      syncServerSession: async () => {},
    },
    "@/lib/turnstile-config": { turnstileSiteKey: "" },
    "react-dom": { createPortal: (children) => children },
    "@/lib/server-auth": {
      getServerAccess: async () => ({
        context: context.access,
        client: {
          from(table) {
            const query = {
              select: () => query,
              eq: () => query,
              order: () => query,
              limit: () => query,
              maybeSingle: async () => ({
                data: overrides.serverRows?.[table] || null,
                error: null,
              }),
            };
            return query;
          },
        },
      }),
    },
  };
  function load(name, parent = process.cwd(), top = false) {
    if (mocks[name]) return mocks[name];
    if (
      !top &&
      (name === "@/components/workspace" ||
        resolve(parent, name) === resolve("components/workspace"))
    )
      return { useWorkspace: () => context };
    if (!name.startsWith("@/") && !name.startsWith(".") && !isAbsolute(name))
      return require(name);
    const base = name.startsWith("@/")
      ? resolve(name.slice(2))
      : resolve(parent, name);
    const file = [base, base + ".tsx", base + ".ts"].find(existsSync);
    if (!file) throw new Error("Cannot resolve " + name);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    let stateIndex = 0;
    const react = {
      ...React,
      use: () => ({ id: "order", token: "fixture" }),
      useState: (initial) => {
        const states = overrides[file.replace(process.cwd() + "/", "")] || {};
        const index = stateIndex++;
        return React.useState(
          Object.hasOwn(states, index) ? states[index] : initial,
        );
      },
    };
    vm.runInNewContext(
      ts.transpileModule(readFileSync(file, "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          esModuleInterop: true,
        },
      }).outputText,
      {
        exports,
        require: (n) => (n === "react" ? react : load(n, dirname(file))),
        Date,
        Intl,
        console,
        URL,
        URLSearchParams,
        AbortController,
        process: { env: {} },
        document: { body: {} },
      },
    );
    if (file.endsWith("lib/assistencia.ts"))
      exports.useRows = (table) => ({
        data: overrides.rows?.[table] || [],
        loading: false,
        error: "",
        reload: async () => {},
      });
    return exports;
  }
  const [source, exportName = "default"] = component.split("#");
  const Component = load(resolve(source), process.cwd(), true)[exportName];
  let content =
    Component.constructor.name === "AsyncFunction"
      ? await Component(props)
      : React.createElement(Component, props);
  if (shell === "panel") {
    const Workspace = load(
      resolve("components/workspace.tsx"),
      process.cwd(),
      true,
    ).default;
    content = React.createElement(
      Workspace,
      {
        initialAccess: context.access,
        initialEmpresa: empresa,
        initialUserId: "fixture",
        initialEmail: empresa.email,
      },
      React.createElement("section", { className: "module" }, content),
    );
  } else if (shell === "admin") {
    const AdminNavigation = load("@/components/admin-navigation").default;
    const AdminHeader = load("@/components/admin-header").default;
    content = React.createElement(
      "div",
      { className: "admin-workspace" },
      React.createElement(
        "aside",
        { className: "admin-sidebar" },
        React.createElement("strong", null, "Horária"),
        React.createElement(
          "div",
          { className: "admin-identity" },
          empresa.email,
        ),
        React.createElement(
          AdminNavigation,
          null,
          React.createElement(
            "nav",
            null,
            ["Empresas", "Configurações", "Auditoria"].map((label) =>
              React.createElement("a", { href: "#", key: label }, label),
            ),
          ),
        ),
      ),
      React.createElement(
        "main",
        { className: "admin-main" },
        React.createElement(AdminHeader),
        content,
      ),
    );
  }
  let css = [
    "globals",
    "workspace",
    "operations",
    ...(shell === "panel" || shell === "admin"
      ? ["theme", "consolidated", "reference-skin"]
      : []),
  ]
    .map((name) => readFileSync(`app/${name}.css`, "utf8"))
    .join("\n");
  if (shell === "admin")
    css += readFileSync("app/admin/admin-management.css", "utf8");
  css += "\n" + readFileSync("app/responsive.css", "utf8");
  if (shell === "panel") css += "\n" + readFileSync("app/analytics.css", "utf8");
  if (shell === "public") {
    css +=
      "\n" +
      styles
        .replace(/:global\(([^)]+)\)/g, "$1")
        .replace(/\.([a-zA-Z][\w-]*)/g, (full, name) =>
          mappings[name] ? "." + mappings[name] : full,
        );
    // Restore public SVG brand selectors that are global in the CSS module.
    css = css.replace(/\.home-horaria-hero-/g, ".horaria-hero-");
  }
  if (compiledCss) css = compiledCss;
  css = css
    .replace(/@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')[^;]*;/g, "")
    .replace(/url\(["']?\//g, "url(/assets/");
  if (process.env.RESPONSIVE_FONT_CSS)
    css = readFileSync(process.env.RESPONSIVE_FONT_CSS, "utf8") + "\n" + css;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style></head><body>${renderToStaticMarkup(content)}</body></html>`;
}

export const fixtures = [
  ["inicio", "components/home-landing.tsx", {}, {}, "public"],
  ["login", "components/auth-page.tsx", { mode: "login" }, {}, "public"],
  ["cadastro", "components/auth-page.tsx", { mode: "signup" }, {}, "public"],
  [
    "painel",
    "components/dashboard-page.tsx",
    {},
    { "components/dashboard-page.tsx": { 0: dashboard, 1: false } },
  ],
  ...[false, true].map((withAlerts) => [
    withAlerts ? "notificacoes-preenchidas" : "notificacoes-vazias",
    "components/dashboard-page.tsx",
    {},
    {
      "components/dashboard-page.tsx": { 0: dashboard, 1: false },
      "components/workspace.tsx": {
        11: "11/10/2026, 18:30:00",
        12: true,
        15: withAlerts
          ? [
              {
                id: "notification-fixture",
                title: "Orçamento aguardando aprovação",
                text: longName,
                href: "/painel/ordens/order",
                tone: "approval",
                createdAt: date + "T12:00:00Z",
              },
            ]
          : [],
      },
    },
  ]),
  [
    "ordens",
    "components/orders-list.tsx",
    {},
    {
      "components/orders-list.tsx": {
        8: {
          page: 1,
          pageSize: 30,
          total: 1,
          items: [order],
          technicians: [order.tecnico],
          metrics: {},
        },
        9: false,
      },
    },
  ],
  [
    "clientes",
    "components/records.tsx",
    { kind: "clientes" },
    {
      "components/records.tsx": {
        3: { page: 1, pageSize: 30, total: 1, items: [client], metrics: {} },
        4: false,
        6: true,
      },
    },
  ],
  [
    "equipamentos",
    "components/records.tsx",
    { kind: "equipamentos" },
    {
      "components/records.tsx": {
        3: {
          page: 1,
          pageSize: 30,
          total: 1,
          items: [
            {
              ...order,
              categoria: "Celular",
              marca: "Apple",
              modelo: order.equipamento_modelo,
              cor: "Preto",
              order_count: 2,
              latest_status: "em_reparo",
            },
          ],
          metrics: {},
        },
        4: false,
        6: true,
      },
    },
  ],
  [
    "financeiro",
    "components/dashboard-finance.tsx",
    {},
    { "components/dashboard-finance.tsx": { 0: [entry], 7: false } },
  ],
  [
    "lancamento",
    "components/finance.tsx",
    {},
    {
      "components/finance.tsx": {
        0: {
          page: 1,
          pageSize: 30,
          total: 1,
          entries: [entry],
          metrics: {},
          origins: { reparo: 0, loja: 0, seminovo: 0, manual: 1234 },
          recent: [entry],
          pending: [],
          evolution: [],
        },
        2: true,
        5: false,
      },
    },
  ],
  [
    "mesa",
    "components/repair-bench.tsx",
    {},
    {
      "components/repair-bench.tsx": {
        0: { items: [order], technicians: [] },
        1: false,
      },
    },
  ],
  ...Array.from({ length: 7 }, (_, i) => [
    `nova-os-${i + 1}`,
    "components/order-form.tsx",
    {},
    { "components/order-form.tsx": { 0: i + 1, 10: true, 11: true } },
  ]),
  [
    "estoque",
    "components/inventory-management.tsx",
    {},
    {
      "components/inventory-management.tsx": {
        0: {
          page: 1,
          pageSize: 30,
          total: 0,
          items: [],
          movements: [],
          metrics: {},
        },
        2: "new",
        11: false,
      },
    },
  ],
  [
    "servicos",
    "components/catalog-management.tsx",
    {},
    {
      "components/catalog-management.tsx": {
        0: { page: 1, pageSize: 30, total: 0, items: [], metrics: {} },
        2: "new",
        7: false,
      },
    },
  ],
  ...[
    "empresa",
    "configuracoes",
    "perfil",
    "ajuda",
    "vendas",
    "seminovos",
    "vitrine",
    "pos-venda",
    "notas-fiscais",
    "equipe",
  ].map((module) => [module, "components/admin-module.tsx", { module }]),
  [
    "adm",
    "components/admin-companies-dashboard.tsx",
    {
      initialCompanies: companies,
      initialOverview: {
        currentCompanies: 3,
        maxCompanies: 100,
        featureFlags: flags,
      },
      initialBilling: billing,
      initialExpenses: [],
    },
    {},
    "admin",
  ],
  [
    "adm-recursos",
    "components/platform-feature-controls.tsx",
    { flags, onChange: () => {} },
    {},
    "admin",
  ],
  [
    "adm-configuracoes",
    "components/admin-dashboard.tsx",
    {
      initialCompanies: companies,
      initialOverview: {
        currentCompanies: 3,
        maxCompanies: 100,
        featureFlags: flags,
        registrationEnabled: true,
      },
      settingsOnly: true,
    },
    {},
    "admin",
  ],
  [
    "adm-auditoria",
    "components/admin-audit.tsx",
    {
      entries: [
        {
          id: 1,
          action: "Configurações atualizadas",
          company: longName,
          actorEmail: empresa.email,
          reason: "Atualização das permissões da plataforma",
          details: {},
          createdAt: date,
        },
      ],
    },
    {},
    "admin",
  ],
  [
    "diagnostico",
    "components/diagnosis.tsx",
    { ordemId: "order", empresaId: empresa.id },
    {
      "components/diagnosis.tsx": {
        9: false,
        4: [
          {
            nome: "Tela de substituição para iPhone 17 Pro Max",
            quantidade: 1,
            status: "A pedir",
          },
        ],
      },
    },
  ],
  [
    "orcamento",
    "components/quote.tsx",
    {
      ordemId: "order",
      trackingToken: "fixture",
      telefone: empresa.telefone,
      onChanged() {},
    },
    {
      "components/quote.tsx": {
        1: true,
        2: [
          {
            descricao: "Manutenção e revisão de componentes",
            quantidade: 1,
            valor: 100,
          },
        ],
        3: [{ descricao: "Tela de substituição", quantidade: 1, valor: 100 }],
      },
    },
  ],
  [
    "garantia",
    "components/warranty.tsx",
    { ordemId: "order" },
    { "components/warranty.tsx": { 1: false, 4: true } },
  ],
  [
    "administracao-os",
    "components/order-administration.tsx",
    {
      order,
      canManageTechnical: true,
      canViewDeviceSecret: true,
      onChanged() {},
    },
  ],
  [
    "resumo-os",
    "app/painel/ordens/[id]/page.tsx",
    { params: {} },
    {
      "app/painel/ordens/[id]/page.tsx": {
        0: {
          order: {
            ...order,
            estado: ["Tela quebrada"],
            token_acompanhamento: "fixture",
          },
          client,
          equipment: {
            modelo: order.equipamento_modelo,
            marca: "Apple",
            imei: "123456789012345",
          },
        },
        3: false,
      },
    },
  ],
  [
    "timeline-os",
    "components/order-timeline.tsx",
    { orderId: "order", status: order.status, createdAt: order.criado_em },
    { "components/order-timeline.tsx": { 1: false } },
  ],
  [
    "fotos-os",
    "components/photos.tsx#PhotosPanel",
    { ordemId: "order", empresaId: empresa.id, categoria: "Entrada" },
  ],
  [
    "camera",
    "components/inline-camera.tsx",
    {
      onUse() {},
      onClose() {},
      guideLabel: "Foto da frente",
      guideInstruction: "Enquadre o equipamento inteiro",
    },
  ],
  [
    "mfa-configurar",
    "components/super-admin-mfa.tsx",
    { next: "/admin", email: empresa.email },
    { "components/super-admin-mfa.tsx": { 0: false } },
    "public",
  ],
  [
    "mfa-confirmar",
    "components/super-admin-mfa.tsx",
    { next: "/admin", email: empresa.email },
    { "components/super-admin-mfa.tsx": { 0: false, 3: true } },
    "public",
  ],
  [
    "mfa-qr",
    "components/super-admin-mfa.tsx",
    { next: "/admin", email: empresa.email },
    {
      "components/super-admin-mfa.tsx": {
        0: false,
        1: {
          id: "test",
          qrCode:
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='black'/%3E%3C/svg%3E",
          secret: "ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP",
        },
      },
    },
    "public",
  ],
  [
    "fiscal-imprimir",
    "app/painel/notas-fiscais/[id]/imprimir/page.tsx",
    { params: Promise.resolve({ id: "document" }) },
    {
      serverRows: {
        fiscal_documents: {
          id: "document",
          ordem_id: order.id,
          criado_em: order.criado_em,
          status: "rascunho",
          valor: 1234.56,
          mensagem: order.problema,
        },
        fiscal_settings: { razao_social: longName, cnpj: "12345678901234" },
        ordens_servico: order,
        clientes: client,
        equipamentos: {
          marca: "Apple",
          modelo: order.equipamento_modelo,
          categoria: "Celular",
        },
        orcamentos: { total: 1234.56, servicos: [], pecas: [] },
      },
    },
  ],
  [
    "agendamento-confirmado",
    "app/agendar/[slug]/obrigado/page.tsx",
    {
      params: Promise.resolve({ slug: empresa.slug }),
      searchParams: Promise.resolve({
        servico: "Troca de tela",
        dia: date,
        hora: "09:00",
      }),
    },
    {},
    "public",
  ],
  [
    "solicitacao-confirmada",
    "app/solicitacao-enviada/[token]/page.tsx",
    {
      params: Promise.resolve({ token: "fixture" }),
      searchParams: Promise.resolve({ os: "1027" }),
    },
    {},
    "public",
  ],
  [
    "editor-pagina",
    "components/public-page-settings.tsx",
    {},
    {
      "components/public-page-settings.tsx": {
        0: {
          ...empresa.pagina,
          headline: longName,
          subheadline: "Manutenção de celulares, notebooks e eletrodomésticos",
          botao_primario: "Agendar atendimento",
          botao_secundario: "Acompanhar reparo",
          mostrar_botao_secundario: true,
          limite_servicos: 6,
          cor_destaque: "#11212d",
          cor_fundo: "#ffffff",
          cor_texto: "#11212d",
          preset: "elegante",
        },
      },
    },
  ],
  [
    "adm-empresa",
    "components/admin-company.tsx",
    {
      company: {
        ...companies[0],
        featureFlags: flags,
        subscription: {
          plan: "Horária",
          status: "TRIAL",
          startedAt: date,
          trialEndsAt: "2026-10-18",
        },
        members: [
          {
            userId: "member",
            name: client.nome,
            email: empresa.email,
            role: "OWNER",
            status: "ACTIVE",
          },
        ],
      },
    },
    {},
    "admin",
  ],
  [
    "orcamentos-lista",
    "app/painel/orcamentos/page.tsx",
    {},
    {
      rows: {
        clientes: [client],
        ordens_servico: [{ ...order, cliente_id: client.id }],
        orcamentos: [
          {
            id: "quote",
            ordem_id: "order",
            versao: 1,
            total: 100,
            status: "enviado",
            validade: "2026-10-20",
            criado_em: date,
          },
        ],
      },
    },
  ],
  [
    "equipe-formulario",
    "components/team-permissions.tsx",
    {},
    {
      "components/team-permissions.tsx": {
        0: {
          actorRole: "OWNER",
          items: [
            {
              userId: "member",
              name: client.nome,
              email: empresa.email,
              role: "TECHNICIAN",
              status: "ACTIVE",
              createdAt: date,
              isCurrentUser: false,
            },
          ],
        },
        2: false,
        4: true,
      },
    },
  ],
  ...[1, 2, 3, 4].map((step) => [
    `fiscal-${step}`,
    "components/fiscal-notes.tsx",
    {},
    { "components/fiscal-notes.tsx": { 8: step, 12: false } },
  ]),
  ["assinatura", "app/painel/assinatura/page.tsx"],
  [
    "agenda-dia",
    "app/painel/agenda/page.tsx",
    {},
    {
      "app/painel/agenda/page.tsx": {
        0: [
          {
            id: "appointment",
            inicio: date + "T12:00:00",
            nome_cliente: client.nome,
            descricao: order.problema,
            status: "aguardando",
            prioridade: "alta",
          },
        ],
        1: false,
        5: true,
      },
    },
  ],
  [
    "agenda-semana",
    "app/painel/agenda/page.tsx",
    {},
    { "app/painel/agenda/page.tsx": { 1: false, 4: "semana", 6: true } },
  ],
  [
    "agenda-mes",
    "app/painel/agenda/page.tsx",
    {},
    { "app/painel/agenda/page.tsx": { 1: false, 4: "mes" } },
  ],
  ["consulta-acompanhamento", "app/acompanhar/page.tsx", {}, {}, "public"],
  ...["termos", "privacidade", "manutencao"].map((route) => [
    route,
    `app/${route}/page.tsx`,
    {},
    {},
    "public",
  ]),
  ["recuperar-senha", "app/recuperar-senha/page.tsx", {}, {}, "public"],
  [
    "redefinir-senha",
    "app/redefinir-senha/page.tsx",
    {},
    { "components/password-recovery.tsx": { 5: false, 6: true } },
    "public",
  ],
  ["nao-encontrado", "app/not-found.tsx", {}, {}, "public"],
  ["conta-bloqueada", "app/conta-bloqueada/page.tsx", {}, {}, "public"],
  [
    "portal",
    "components/public-portal.tsx",
    { slug: empresa.slug },
    {
      "components/public-portal.tsx": {
        0: {
          ...empresa,
          descricao: "Assistência especializada",
          servicos: [
            {
              id: "service",
              nome: "Troca de tela",
              valor: 100,
              duracao_minutos: 60,
            },
          ],
          solicitar_endereco: true,
          fotos_obrigatorias: false,
          horario: empresa.horario,
        },
        3: false,
      },
    },
    "public",
  ],
  [
    "acompanhamento",
    "components/tracking-result.tsx",
    {
      data: {
        numero: 1027,
        empresa: longName,
        status: "aguardando_aprovacao",
        previsao: "2026-10-15",
        equipamento: {
          categoria: "Celular",
          marca: "Apple",
          modelo: "iPhone 17 Pro Max",
        },
        orcamento: {
          servicos: [
            { descricao: "Troca de tela e revisão", quantidade: 1, valor: 100 },
          ],
          pecas: [],
          status: "enviado",
          total: 100,
          validade: "2026-10-20",
          descricao: "Troca de tela",
        },
        historico: [
          {
            evento: "Orçamento enviado para aprovação",
            data: date,
            status: "aguardando_aprovacao",
          },
        ],
      },
      busy: false,
      note: "",
      onNote: () => {},
      onRespond: () => {},
    },
    {},
    "public",
  ],
];

fixtures.push(
  ...["clientes", "equipamentos"].map((kind) => [
    `detalhe-${kind}`,
    "components/record-detail.tsx",
    { id: kind === "clientes" ? client.id : "device", kind },
    {
      rows: {
        clientes: [client],
        equipamentos: [
          {
            id: "device",
            cliente_id: client.id,
            categoria: "Celular",
            marca: "Apple",
            modelo: order.equipamento_modelo,
            imei: "123456789012345",
            cor: "Preto",
            acessorios: "Carregador original e acessórios",
            numero_serie: "SERIE-MUITO-EXTENSA-123456789012345",
          },
        ],
        ordens_servico: [
          { ...order, cliente_id: client.id, equipamento_id: "device" },
        ],
      },
    },
  ]),
  [
    "venda-preenchida",
    "components/sales.tsx",
    {},
    {
      "components/sales.tsx": {
        0: [
          {
            peca_id: "part",
            nome: entry.descricao,
            quantidade: 1,
            preco: 1234.56,
            estoque: 5,
          },
        ],
        1: true,
      },
      rows: {
        clientes: [client],
        pecas: [
          { id: "part", nome: entry.descricao, preco: 1234.56, quantidade: 5 },
        ],
        vendas: [
          {
            id: "sale",
            numero: 10,
            total: 1234.56,
            lucro: 100,
            vendido_em: order.criado_em,
          },
        ],
      },
    },
  ],
  [
    "seminovo-vender",
    "components/used-devices.tsx",
    {},
    {
      "components/used-devices.tsx": {
        1: {
          id: "used",
          marca: "Apple",
          modelo: order.equipamento_modelo,
          status: "pronto_venda",
          preco_venda: 1234.56,
        },
      },
      rows: {
        clientes: [client],
        seminovos: [
          {
            id: "used",
            marca: "Apple",
            modelo: order.equipamento_modelo,
            status: "pronto_venda",
            preco_venda: 1234.56,
            valor_compra: 900,
            custos_reparo: 100,
          },
        ],
      },
    },
  ],
);

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const output = process.argv[2] || "/tmp/horaria-responsive";
  mkdirSync(output, { recursive: true });
  let failed = 0;
  for (const [name, component, props, overrides, shell] of fixtures) {
    try {
      writeFileSync(
        resolve(output, name + ".html"),
        await renderFixture(component, props, overrides, shell),
      );
      console.log("Rendered", name);
    } catch (error) {
      failed++;
      console.error("FAIL", name, error.stack);
    }
  }
  if (failed) process.exitCode = 1;
}
