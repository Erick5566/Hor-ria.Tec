import { csvCell } from "./csv";

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  responsible: string;
  email: string;
  phone?: string | null;
  status: string;
  subscriptionStatus?: string | null;
  createdAt: string;
  dueAt?: string | null;
  trialEndsAt?: string | null;
  lastAccessAt?: string | null;
  amountDue?: number | null;
  ordersCount: number;
  customersCount: number;
};

export const adminStatusLabels: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Em teste",
  PAST_DUE: "Pagamento pendente",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
  PENDING_DELETION: "Aguardando exclusão",
};
export const adminQueues = [
  { id: "ALL", label: "Todas", description: "Base completa de empresas" },
  {
    id: "OVERDUE",
    label: "Em atraso",
    description: "Vencidas com valor em aberto",
  },
  {
    id: "DUE_SOON",
    label: "Vencem em 7 dias",
    description: "Prepare os próximos contatos",
  },
  {
    id: "TRIAL_ENDING",
    label: "Teste terminando",
    description: "Até 72 horas para o fim",
  },
  {
    id: "INACTIVE",
    label: "Sem acesso há 7 dias",
    description: "Clientes que precisam de atenção",
  },
  {
    id: "NO_ORDERS",
    label: "Sem primeira OS",
    description: "Ajude a começar a usar",
  },
] as const;
export type AdminQueue = (typeof adminQueues)[number]["id"];
export type AdminSort =
  "last_access" | "name" | "created" | "due" | "amount_due" | "orders";
const day = 86_400_000;
function timestamp(value?: string | null) {
  const result = value ? Date.parse(value) : NaN;
  return Number.isFinite(result) ? result : null;
}
const operating = (company: CompanySummary) =>
  ["ACTIVE", "TRIAL", "PAST_DUE"].includes(company.status);

export function inAdminQueue(
  company: CompanySummary,
  queue: AdminQueue,
  now: number,
): boolean {
  const due = timestamp(company.dueAt);
  if (queue === "ALL") return true;
  if (queue === "OVERDUE")
    return due !== null && due < now && Number(company.amountDue || 0) > 0;
  if (!operating(company)) return false;
  if (queue === "DUE_SOON")
    return due !== null && due >= now && due <= now + 7 * day;
  if (queue === "TRIAL_ENDING") {
    const end = timestamp(company.trialEndsAt);
    return (
      company.status === "TRIAL" &&
      end !== null &&
      end >= now &&
      end <= now + 3 * day
    );
  }
  if (queue === "NO_ORDERS") return company.ordersCount === 0;
  const access =
    timestamp(company.lastAccessAt) ?? timestamp(company.createdAt);
  return access !== null && access <= now - 7 * day;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

export function filterAdminCompanies<T extends CompanySummary>(
  rows: readonly T[],
  {
    search = "",
    status = "ALL",
    queue = "ALL",
    sort = "last_access",
    now = Date.now(),
  }: {
    search?: string;
    status?: string;
    queue?: AdminQueue;
    sort?: AdminSort;
    now?: number;
  } = {},
): T[] {
  const query = normalize(search.trim());
  const phoneQuery = search.replace(/\D/g, "");
  return rows
    .filter((company) => {
      const searchable = normalize(
        [
          company.name,
          company.responsible,
          company.email,
          company.slug,
          company.phone || "",
        ].join(" "),
      );
      const phoneMatches =
        /^[\d\s()+.-]+$/.test(search.trim()) &&
        phoneQuery.length > 0 &&
        (company.phone || "").replace(/\D/g, "").includes(phoneQuery);
      return (
        (!query || searchable.includes(query) || phoneMatches) &&
        (status === "ALL" || company.status === status) &&
        inAdminQueue(company, queue, now)
      );
    })
    .sort((a, b) => {
      let delta = 0;
      if (sort === "name")
        delta = a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
      if (sort === "created")
        delta = (timestamp(b.createdAt) ?? 0) - (timestamp(a.createdAt) ?? 0);
      if (sort === "last_access")
        delta =
          (timestamp(b.lastAccessAt) ?? 0) - (timestamp(a.lastAccessAt) ?? 0);
      if (sort === "due")
        delta =
          (timestamp(a.dueAt) ?? Number.MAX_SAFE_INTEGER) -
          (timestamp(b.dueAt) ?? Number.MAX_SAFE_INTEGER);
      if (sort === "amount_due")
        delta = Number(b.amountDue || 0) - Number(a.amountDue || 0);
      if (sort === "orders") delta = b.ordersCount - a.ordersCount;
      return delta || a.id.localeCompare(b.id);
    });
}

export function adminCompaniesCsv(rows: readonly CompanySummary[]): string {
  const data: unknown[][] = [
    [
      "Empresa",
      "Endereço da página",
      "Responsável",
      "E-mail",
      "Telefone",
      "Status",
      "Vencimento (ISO)",
      "Em aberto (R$)",
      "Último acesso (ISO)",
      "Clientes",
      "Ordens de serviço",
    ],
  ];
  for (const company of rows)
    data.push([
      company.name,
      company.slug,
      company.responsible,
      company.email,
      company.phone,
      adminStatusLabels[company.status] || company.status,
      company.dueAt,
      Number(company.amountDue || 0)
        .toFixed(2)
        .replace(".", ","),
      company.lastAccessAt,
      company.customersCount,
      company.ordersCount,
    ]);
  return "\uFEFF" + data.map((row) => row.map(csvCell).join(";")).join("\r\n");
}

export function companyWhatsapp(phone?: string | null): string | null {
  let digits = (phone || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  return /^55\d{10,11}$/.test(digits) ? "https://wa.me/" + digits : null;
}
