/** One catalogue for the administrative controls and panel availability. */
export const platformFeatures = [
  {
    key: "dashboardEnabled",
    label: "Visão geral",
    group: "Operação",
    description: "Indicadores e resumo da assistência.",
    defaultEnabled: true,
  },
  {
    key: "ordersEnabled",
    label: "Ordens e recebimento",
    group: "Operação",
    description: "Nova OS, detalhes e mesa de reparo.",
    defaultEnabled: true,
  },
  {
    key: "quotesEnabled",
    label: "Orçamentos",
    group: "Operação",
    description: "Página de consulta e acompanhamento de orçamentos.",
    defaultEnabled: true,
  },
  {
    key: "appointmentsEnabled",
    label: "Agenda",
    group: "Operação",
    description: "Calendário e agendamentos.",
    defaultEnabled: true,
  },
  {
    key: "customersEnabled",
    label: "Clientes",
    group: "Clientes e vendas",
    description: "Cadastro e histórico dos clientes.",
    defaultEnabled: true,
  },
  {
    key: "equipmentEnabled",
    label: "Aparelhos",
    group: "Clientes e vendas",
    description: "Cadastro e histórico dos equipamentos.",
    defaultEnabled: true,
  },
  {
    key: "stockEnabled",
    label: "Estoque",
    group: "Clientes e vendas",
    description: "Produtos, peças e movimentações.",
    defaultEnabled: false,
  },
  {
    key: "salesEnabled",
    label: "Vendas de produtos",
    group: "Clientes e vendas",
    description: "Página de vendas e seus registros.",
    defaultEnabled: true,
  },
  {
    key: "tradeInEnabled",
    label: "Seminovos / Trade-in",
    group: "Clientes e vendas",
    description: "Compra, avaliação e gestão de seminovos.",
    defaultEnabled: true,
  },
  {
    key: "showcaseEnabled",
    label: "Gestão da vitrine",
    group: "Clientes e vendas",
    description: "Edição da vitrine no painel. Não retira anúncios publicados.",
    defaultEnabled: true,
  },
  {
    key: "afterSalesEnabled",
    label: "Pós-venda",
    group: "Clientes e vendas",
    description: "Página de acompanhamento e relacionamento.",
    defaultEnabled: true,
  },
  {
    key: "servicesEnabled",
    label: "Serviços e garantias",
    group: "Administrativo",
    description: "Catálogo de serviços da assistência.",
    defaultEnabled: true,
  },
  {
    key: "financialEnabled",
    label: "Financeiro e relatórios",
    group: "Administrativo",
    description: "Receitas, despesas, gráficos e relatórios financeiros.",
    defaultEnabled: true,
  },
  {
    key: "invoicesEnabled",
    label: "Notas fiscais",
    group: "Administrativo",
    description: "Gestão e impressão de documentos fiscais no painel.",
    defaultEnabled: true,
  },
  {
    key: "teamEnabled",
    label: "Equipe",
    group: "Administrativo",
    description: "Página de membros, convites e permissões.",
    defaultEnabled: true,
  },
  {
    key: "businessEnabled",
    label: "Minha assistência",
    group: "Ajustes",
    description: "Edição de dados, endereço, logo e horários.",
    defaultEnabled: true,
  },
  {
    key: "publicPageEnabled",
    label: "Minha página",
    group: "Ajustes",
    description:
      "Editor da página pública. A página publicada continua disponível.",
    defaultEnabled: true,
  },
  {
    key: "settingsEnabled",
    label: "Configurações e aparência",
    group: "Ajustes",
    description: "Preferências e personalização do painel.",
    defaultEnabled: true,
  },
  {
    key: "aiEnabled",
    label: "Inteligência artificial",
    group: "Integrações",
    description:
      "Permissão da integração; depende de implementação e configuração.",
    defaultEnabled: false,
  },
  {
    key: "whatsappEnabled",
    label: "WhatsApp",
    group: "Integrações",
    description: "Permissão de automação; depende de provedor e credenciais.",
    defaultEnabled: false,
  },
] as const;

export type PlatformFeatureKey = (typeof platformFeatures)[number]["key"];
export type PlatformFeatureValues = Partial<
  Record<PlatformFeatureKey, boolean>
>;

export function featureEnabled(
  flags: PlatformFeatureValues | null | undefined,
  key: PlatformFeatureKey,
) {
  const value = flags?.[key];
  return typeof value === "boolean"
    ? value
    : platformFeatures.find((feature) => feature.key === key)!.defaultEnabled;
}

const moduleFeatures: Record<string, PlatformFeatureKey> = {
  ordens: "ordersEnabled",
  "mesa-reparo": "ordersEnabled",
  orcamentos: "quotesEnabled",
  agenda: "appointmentsEnabled",
  clientes: "customersEnabled",
  equipamentos: "equipmentEnabled",
  estoque: "stockEnabled",
  vendas: "salesEnabled",
  seminovos: "tradeInEnabled",
  vitrine: "showcaseEnabled",
  "pos-venda": "afterSalesEnabled",
  servicos: "servicesEnabled",
  financeiro: "financialEnabled",
  relatorios: "financialEnabled",
  "notas-fiscais": "invoicesEnabled",
  equipe: "teamEnabled",
  empresa: "businessEnabled",
  "minha-pagina": "publicPageEnabled",
  "pagina-cliente": "publicPageEnabled",
  configuracoes: "settingsEnabled",
};

export function featureForPath(path: string): PlatformFeatureKey | null {
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/$/, "");
  if (pathname === "/painel") return "dashboardEnabled";
  if (!pathname.startsWith("/painel/")) return null;
  return moduleFeatures[pathname.split("/")[2]] || null;
}

export function panelPathEnabled(
  flags: PlatformFeatureValues | null | undefined,
  path: string,
) {
  const feature = featureForPath(path);
  return !feature || featureEnabled(flags, feature);
}

export function platformFeatureChanges(
  form: FormData,
  existing: Record<string, boolean>,
) {
  return {
    ...existing,
    ...Object.fromEntries(
      platformFeatures.map(({ key }) => [key, form.get(key) === "on"]),
    ),
  };
}
