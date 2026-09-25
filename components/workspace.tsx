"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  supabase,
  Empresa,
  message,
  configured,
  syncServerSession,
} from "@/lib/supabase";
import type { AccessContext } from "@/lib/access";
import { Brand, MissingConfig } from "./brand";
import Setup from "./setup";
import { HorariaIcon, type HorariaIconName } from "./horaria-icon";
type WorkspaceValue = {
  empresa: Empresa;
  userId: string;
  email: string;
  access: AccessContext;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  periodStart: string;
  periodEnd: string;
  setPeriod: (start: string, end: string) => void;
  refresh: () => Promise<void>;
};
type WorkspaceAlert = {
  id: string;
  title: string;
  text: string;
  href: string;
  tone: "urgent" | "warning" | "ready" | "approval" | "appointment" | "stock";
  createdAt: string;
};

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function localMonth() {
  return localDate().slice(0, 7);
}

function rangeForMonth(month = localMonth()) {
  const [year, value] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
  return { start: month + "-01", end };
}

const Context = createContext<WorkspaceValue | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace ausente");
  return value;
}
export const menu = [
  [
    "ATENDIMENTO",
    [
      ["Painel", "/painel", "home"],
      ["Recebimento", "/painel/ordens/nova", "receive"],
      ["Central de Atendimento", "/painel/mesa-reparo", "central"],
      ["Agenda", "/painel/agenda", "calendar"],
      ["Ordens de serviço", "/painel/ordens", "orders"],
      ["Clientes", "/painel/clientes", "clients"],
      ["Equipamentos", "/painel/equipamentos", "devices"],
    ],
  ],
  [
    "GESTÃO",
    [
      ["Estoque", "/painel/estoque", "stock"],
      ["Financeiro", "/painel/financeiro", "finance"],
      ["Relatórios", "/painel/relatorios", "reports"],
      ["Serviços", "/painel/servicos", "services"],
    ],
  ],
  [
    "EMPRESA",
    [
      ["Minha assistência", "/painel/empresa", "business"],
      ["Minha página", "/painel/minha-pagina", "publicPage"],
      ["Equipe", "/painel/equipe", "team"],
      ["Configurações", "/painel/configuracoes", "settings"],
    ],
  ],
] as const satisfies ReadonlyArray<
  readonly [
    string,
    ReadonlyArray<readonly [string, string, HorariaIconName]>,
  ]
>;

const eagerMenuRoutes = new Set([
  "/painel",
  "/painel/ordens",
  "/painel/ordens/nova",
  "/painel/clientes",
]);


export default function Workspace({
  children,
  initialAccess,
  initialEmpresa,
  initialUserId,
  initialEmail,
}: {
  children: React.ReactNode;
  initialAccess: AccessContext;
  initialEmpresa: Empresa | null;
  initialUserId: string;
  initialEmail: string;
}) {
  const [empresa, setEmpresa] = useState<Empresa | null>(initialEmpresa),
    [access, setAccess] = useState(initialAccess),
    [userId, setUserId] = useState(initialUserId),
    [email, setEmail] = useState(initialEmail),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [globalSearch, setGlobalSearch] = useState(""),
    [selectedMonth, setSelectedMonthState] = useState(localMonth()),
    [periodStart, setPeriodStart] = useState(() => rangeForMonth().start),
    [periodEnd, setPeriodEnd] = useState(() => rangeForMonth().end),
    [liveDateTime, setLiveDateTime] = useState(""),
    [alertsOpen, setAlertsOpen] = useState(false),
    [profileOpen, setProfileOpen] = useState(false),
    [mobileMoreOpen, setMobileMoreOpen] = useState(false),
    [alerts, setAlerts] = useState<WorkspaceAlert[]>([]),
    [readAlertIds, setReadAlertIds] = useState<Set<string>>(new Set());
  const router = useRouter(),
    path = usePathname();
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProfileOpen(false);
  }, [path]);

  useEffect(() => {
    if (!profileOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target)
      ) {
        setProfileOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setProfileOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  const title =
    menu
      .reduce<ReadonlyArray<readonly [string, string, string]>>(
        (all, group) => [...all, ...group[1]],
        [],
      )
      .find((item) => item[1] === path)?.[0] ||
    (path.startsWith("/painel/ordens/") ? "Ordem de serviço" : "Assistência técnica");

  const setPeriod = useCallback((start: string, end: string) => {
    if (!start || !end) return;
    const normalizedStart = start <= end ? start : end;
    const normalizedEnd = start <= end ? end : start;
    setPeriodStart(normalizedStart);
    setPeriodEnd(normalizedEnd);
    setSelectedMonthState(normalizedStart.slice(0, 7));
  }, []);

  const setSelectedMonth = useCallback((month: string) => {
    const next = rangeForMonth(month || localMonth());
    setSelectedMonthState((month || localMonth()).slice(0, 7));
    setPeriodStart(next.start);
    setPeriodEnd(next.end);
  }, []);
  const refresh = useCallback(async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        router.replace("/");
        return;
      }
      setUserId(data.user.id);
      setEmail(data.user.email || "");
      const accessResult = await supabase.rpc("access_context");
      if (accessResult.error) throw accessResult.error;
      const nextAccess = accessResult.data as AccessContext;
      setAccess(nextAccess);
      if (nextAccess.globalMaintenance || nextAccess.company?.maintenance) {
        router.replace(nextAccess.isSuperAdmin ? "/admin" : "/manutencao");
        return;
      }
      if (
        nextAccess.company &&
        ["SUSPENDED", "CANCELED", "PENDING_DELETION"].includes(
          nextAccess.company.status,
        )
      ) {
        router.replace(`/conta-bloqueada?status=${nextAccess.company.status}`);
        return;
      }
      const result = await supabase
        .from("empresas")
        .select("*")
        .eq(
          "id",
          nextAccess.company?.id || "00000000-0000-0000-0000-000000000000",
        )
        .maybeSingle();
      if (result.error) throw result.error;
      setEmpresa(result.data);
      void supabase.rpc("registrar_acesso");
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setLoading(false);
    }
  }, [router]);
  useEffect(() => {
    const { data } = supabase?.auth.onAuthStateChange(
      async (event, session) => {
        if (["SIGNED_IN", "TOKEN_REFRESHED"].includes(event) && session)
          await syncServerSession(session);
        if (event === "SIGNED_OUT") {
          await syncServerSession(null);
          router.replace("/");
        }
      },
    ) || { data: null };

    // The server already validated the session and loaded the company.
    // Refresh quietly after first paint instead of blocking the whole workspace.
    const backgroundRefresh = window.setTimeout(() => {
      void refresh();
    }, 4000);

    return () => {
      window.clearTimeout(backgroundRefresh);
      data?.subscription.unsubscribe();
    };
  }, [refresh, router]);
  useEffect(() => {
    setOpen(false);
    setMobileMoreOpen(false);
  }, [path]);

  useEffect(() => {
    const updateClock = () => {
      setLiveDateTime(
        new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    };

    updateClock();
    const timer = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.title = `${title} | Horária`;
  }, [title]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setAlertsOpen(false);
        setProfileOpen(false);
        setMobileMoreOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  const loadAlerts = useCallback(async () => {
    if (!empresa?.id || !supabase || !userId) return;

    const [
      ordersResult,
      quotesResult,
      appointmentsResult,
      stockResult,
      benchResult,
      readsResult,
    ] = await Promise.all([
      supabase
        .from("ordens_servico")
        .select("id,numero,status,prioridade,prazo_previsto,atualizado_em")
        .eq("empresa_id", empresa.id)
        .in("status", [
          "novo",
          "recebido",
          "em_diagnostico",
          "aguardando_orcamento",
          "orcamento_enviado",
          "aguardando_aprovacao",
          "orcamento_aprovado",
          "em_reparo",
          "aguardando_peca",
          "em_testes",
          "pronto_retirada",
        ])
        .order("atualizado_em", { ascending: false })
        .limit(60),
      supabase
        .from("orcamentos")
        .select("id,ordem_id,status,criado_em,respondido_em")
        .eq("empresa_id", empresa.id)
        .in("status", ["enviado", "aprovado", "alteracao_solicitada"])
        .order("criado_em", { ascending: false })
        .limit(50),
      supabase
        .from("agendamentos")
        .select("id,nome_cliente,inicio,status,bloqueio")
        .eq("empresa_id", empresa.id)
        .eq("bloqueio", false)
        .eq("status", "aguardando")
        .gte("inicio", new Date().toISOString())
        .order("inicio", { ascending: true })
        .limit(20),
      supabase
        .from("pecas")
        .select("id,nome,quantidade,estoque_minimo,ativo")
        .eq("empresa_id", empresa.id)
        .eq("ativo", true)
        .limit(100),
      supabase.rpc("repair_bench_data"),
      supabase
        .from("notification_reads")
        .select("notification_id")
        .eq("empresa_id", empresa.id)
        .eq("usuario_id", userId),
    ]);

    if (ordersResult.error) {
      setError(message(ordersResult.error));
      return;
    }

    const today = localDate();
    const next: WorkspaceAlert[] = [];
    const orders = ordersResult.data || [];

    for (const order of orders) {
      if (order.prioridade === "urgente") {
        next.push({
          id: "urgent-" + order.id,
          title: `OS #${order.numero} urgente`,
          text: "Prioridade urgente: revise esta ordem o quanto antes.",
          href: `/painel/ordens/${order.id}`,
          tone: "urgent",
          createdAt: order.atualizado_em,
        });
      }

      if (order.prazo_previsto && order.prazo_previsto.slice(0, 10) < today) {
        next.push({
          id: "late-" + order.id,
          title: `OS #${order.numero} com prazo vencido`,
          text: "O prazo previsto desta ordem já passou.",
          href: `/painel/ordens/${order.id}`,
          tone: "warning",
          createdAt: order.prazo_previsto,
        });
      }

      if (order.status === "pronto_retirada") {
        next.push({
          id: "ready-" + order.id,
          title: `OS #${order.numero} pronta para retirada`,
          text: "O equipamento está pronto. Entre em contato para combinar a retirada.",
          href: `/painel/ordens/${order.id}`,
          tone: "ready",
          createdAt: order.atualizado_em,
        });
      }

      if (["orcamento_enviado", "aguardando_aprovacao"].includes(order.status)) {
        next.push({
          id: "approval-" + order.id,
          title: `OS #${order.numero} aguardando aprovação`,
          text: "Há um orçamento aguardando resposta do cliente.",
          href: `/painel/ordens/${order.id}`,
          tone: "approval",
          createdAt: order.atualizado_em,
        });
      }
    }

    if (!quotesResult.error) {
      for (const quote of quotesResult.data || []) {
        const order = orders.find((item) => item.id === quote.ordem_id);

        if (quote.status === "aprovado") {
          next.push({
            id: "quote-approved-" + quote.id,
            title: order
              ? `Orçamento aprovado na OS #${order.numero}`
              : "Orçamento aprovado",
            text: "O cliente aprovou o orçamento. A OS pode seguir para o reparo.",
            href: `/painel/ordens/${quote.ordem_id}`,
            tone: "ready",
            createdAt: quote.respondido_em || quote.criado_em,
          });
        }

        if (quote.status === "alteracao_solicitada") {
          next.push({
            id: "quote-change-" + quote.id,
            title: order
              ? `Alteração solicitada na OS #${order.numero}`
              : "Alteração solicitada em orçamento",
            text: "O cliente pediu uma alteração no orçamento.",
            href: `/painel/ordens/${quote.ordem_id}`,
            tone: "warning",
            createdAt: quote.respondido_em || quote.criado_em,
          });
        }
      }
    }

    if (!appointmentsResult.error) {
      for (const appointment of appointmentsResult.data || []) {
        next.push({
          id: "appointment-" + appointment.id,
          title: appointment.nome_cliente
            ? `Agendamento de ${appointment.nome_cliente}`
            : "Novo agendamento aguardando confirmação",
          text: `Aguardando confirmação para ${new Date(
            appointment.inicio,
          ).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short",
          })}.`,
          href: "/painel/agenda",
          tone: "appointment",
          createdAt: appointment.inicio,
        });
      }
    }

    if (
      !stockResult.error &&
      access.company?.featureFlags.stockEnabled &&
      access.company?.role !== "ATTENDANT"
    ) {
      for (const item of (stockResult.data || []).filter(
        (row) => row.quantidade <= row.estoque_minimo,
      )) {
        next.push({
          id: "stock-" + item.id + "-" + item.quantidade,
          title: `Estoque baixo: ${item.nome}`,
          text:
            item.quantidade <= 0
              ? "Item sem estoque disponível."
              : `Restam ${item.quantidade} unidade(s); mínimo configurado: ${item.estoque_minimo}.`,
          href: "/painel/estoque",
          tone: "stock",
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (!benchResult.error && benchResult.data) {
      const benchItems = (
        benchResult.data as {
          items?: Array<{
            id: string;
            numero: number;
            status: string;
            atualizado_em: string;
            orcamento_criado_em?: string | null;
            ultimo_contato_cliente_em?: string | null;
          }>;
        }
      ).items || [];

      for (const item of benchItems) {
        if (!["orcamento_enviado", "aguardando_aprovacao"].includes(item.status))
          continue;

        const reference = item.orcamento_criado_em || item.atualizado_em;
        const referenceTime = new Date(reference).getTime();
        const lastContact = item.ultimo_contato_cliente_em
          ? new Date(item.ultimo_contato_cliente_em).getTime()
          : 0;
        const waitingHours = (Date.now() - referenceTime) / 3600000;

        if (waitingHours >= 24 && lastContact < referenceTime) {
          next.push({
            id: "followup-" + item.id,
            title: `Retorno pendente na OS #${item.numero}`,
            text: "O orçamento está sem resposta há pelo menos 24 horas.",
            href: `/painel/ordens/${item.id}`,
            tone: "warning",
            createdAt: reference,
          });
        }
      }
    }

    const deduped = Array.from(
      new Map(next.map((item) => [item.id, item])).values(),
    )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 40);

    setAlerts(deduped);
    setReadAlertIds(
      new Set((readsResult.data || []).map((row) => row.notification_id)),
    );
  }, [
    access.company?.featureFlags.stockEnabled,
    access.company?.role,
    empresa?.id,
    userId,
  ]);

  useEffect(() => {
    if (!empresa?.id || !supabase || !userId) return;

    // Notifications are important, but they do not need to compete with the
    // first screen's data requests. Load them just after the main content.
    const initialAlertsTimer = window.setTimeout(() => {
      void loadAlerts();
    }, 700);

    const channel = supabase
      .channel(`workspace-alerts-${empresa.id}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ordens_servico",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        () => void loadAlerts(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orcamentos",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        () => void loadAlerts(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agendamentos",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        () => void loadAlerts(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pecas",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        () => void loadAlerts(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "historico_os",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        () => void loadAlerts(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notification_reads",
          filter: `empresa_id=eq.${empresa.id}`,
        },
        () => void loadAlerts(),
      )
      .subscribe();

    const timer = window.setInterval(loadAlerts, 60000);
    return () => {
      window.clearTimeout(initialAlertsTimer);
      window.clearInterval(timer);
      void supabase!.removeChannel(channel);
    };
  }, [empresa?.id, userId, loadAlerts]);

  async function markAlertRead(alertId: string) {
    if (!empresa?.id || !userId || !supabase || readAlertIds.has(alertId))
      return;
    setReadAlertIds((current) => new Set([...current, alertId]));
    const result = await supabase.from("notification_reads").upsert(
      {
        empresa_id: empresa.id,
        usuario_id: userId,
        notification_id: alertId,
        read_at: new Date().toISOString(),
      },
      { onConflict: "empresa_id,usuario_id,notification_id" },
    );
    if (result.error) {
      setReadAlertIds((current) => {
        const next = new Set(current);
        next.delete(alertId);
        return next;
      });
      setError(message(result.error));
    }
  }

  async function markAllAlertsRead() {
    if (!empresa?.id || !userId || !supabase) return;
    const unread = alerts.filter((alert) => !readAlertIds.has(alert.id));
    if (!unread.length) return;
    const ids = unread.map((alert) => alert.id);
    setReadAlertIds((current) => new Set([...current, ...ids]));
    const result = await supabase.from("notification_reads").upsert(
      unread.map((alert) => ({
        empresa_id: empresa.id,
        usuario_id: userId,
        notification_id: alert.id,
        read_at: new Date().toISOString(),
      })),
      { onConflict: "empresa_id,usuario_id,notification_id" },
    );
    if (result.error) {
      await loadAlerts();
      setError(message(result.error));
    }
  }

  if (!configured) return <MissingConfig />;

  async function submitGlobalSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = globalSearch.trim();
    const query = raw.toLowerCase();
    if (!query) return;

    const destinations = [
      { words: ["clientes"], href: "/painel/clientes" },
      { words: ["equipamentos"], href: "/painel/equipamentos" },
      { words: ["orçamentos", "orcamentos"], href: "/painel/orcamentos" },
      { words: ["agenda", "agendamentos"], href: "/painel/agenda" },
      { words: ["serviços", "servicos"], href: "/painel/servicos" },
      { words: ["financeiro", "finanças", "financas"], href: "/painel/financeiro" },
      { words: ["estoque"], href: "/painel/estoque" },
      { words: ["relatórios", "relatorios"], href: "/painel/relatorios" },
      { words: ["central de atendimento", "atendimento", "diagnósticos", "diagnosticos", "mesa de reparo"], href: "/painel/mesa-reparo" },
      { words: ["recebimento", "nova ordem"], href: "/painel/ordens/nova" },
      { words: ["equipe", "funcionários", "funcionarios", "permissões", "permissoes"], href: "/painel/equipe" },
    ];
    const destination = destinations.find((item) =>
      item.words.some((word) => query === word),
    );
    if (destination) {
      router.push(destination.href);
      setGlobalSearch("");
      return;
    }

    if (!empresa?.id || !supabase) {
      router.push("/painel/ordens?q=" + encodeURIComponent(raw));
      setGlobalSearch("");
      return;
    }

    try {
      const number = Number(raw.replace(/\D/g, ""));
      if (number && (query.startsWith("os") || /^\d+$/.test(raw))) {
        const order = await supabase
          .from("ordens_servico")
          .select("id")
          .eq("empresa_id", empresa.id)
          .eq("numero", number)
          .maybeSingle();
        if (order.data?.id) {
          router.push("/painel/ordens/" + order.data.id);
          setGlobalSearch("");
          return;
        }
      }

      const customer = await supabase
        .from("clientes")
        .select("id")
        .eq("empresa_id", empresa.id)
        .ilike("nome", `%${raw}%`)
        .limit(1)
        .maybeSingle();
      if (customer.data?.id) {
        router.push("/painel/clientes/" + customer.data.id);
        setGlobalSearch("");
        return;
      }

      const deviceByModel = await supabase
        .from("equipamentos")
        .select("id")
        .eq("empresa_id", empresa.id)
        .ilike("modelo", `%${raw}%`)
        .limit(1)
        .maybeSingle();
      if (deviceByModel.data?.id) {
        router.push("/painel/equipamentos/" + deviceByModel.data.id);
        setGlobalSearch("");
        return;
      }

      const deviceByBrand = await supabase
        .from("equipamentos")
        .select("id")
        .eq("empresa_id", empresa.id)
        .ilike("marca", `%${raw}%`)
        .limit(1)
        .maybeSingle();
      if (deviceByBrand.data?.id) {
        router.push("/painel/equipamentos/" + deviceByBrand.data.id);
        setGlobalSearch("");
        return;
      }

      const service = await supabase
        .from("servicos")
        .select("id")
        .eq("empresa_id", empresa.id)
        .ilike("nome", `%${raw}%`)
        .limit(1)
        .maybeSingle();
      if (service.data?.id) {
        router.push("/painel/servicos");
        setGlobalSearch("");
        return;
      }

      const orderByProblem = await supabase
        .from("ordens_servico")
        .select("id")
        .eq("empresa_id", empresa.id)
        .ilike("problema", `%${raw}%`)
        .limit(1)
        .maybeSingle();
      if (orderByProblem.data?.id) {
        router.push("/painel/ordens/" + orderByProblem.data.id);
        setGlobalSearch("");
        return;
      }
    } catch {
      // A busca por página abaixo continua disponível como fallback.
    }

    router.push("/painel/ordens?q=" + encodeURIComponent(raw));
    setGlobalSearch("");
  }

  const unreadAlerts = alerts.filter((alert) => !readAlertIds.has(alert.id));
  const activeMenuHref =
    menu
      .flatMap(([, items]) => items.map(([, href]) => href))
      .filter(
        (href) =>
          path === href ||
          (href !== "/painel" && path.startsWith(href + "/")),
      )
      .sort((a, b) => b.length - a.length)[0] || "";

  const mobilePrimaryNav: Array<{
    label: string;
    href: string;
    icon: HorariaIconName;
  }> = [
    { label: "Painel", href: "/painel", icon: "home" },
    { label: "Central", href: "/painel/mesa-reparo", icon: "central" },
    { label: "Ordens", href: "/painel/ordens", icon: "orders" },
    ...(access.company?.featureFlags.appointmentsEnabled
      ? [{ label: "Agenda", href: "/painel/agenda", icon: "calendar" as const }]
      : []),
  ];

  const mobileMoreLinks: Array<{
    label: string;
    href: string;
    icon: HorariaIconName;
    managerOnly?: boolean;
  }> = [
    { label: "Recebimento", href: "/painel/ordens/nova", icon: "receive" },
    { label: "Clientes", href: "/painel/clientes", icon: "clients" },
    { label: "Equipamentos", href: "/painel/equipamentos", icon: "devices" },
    ...(access.company?.role !== "ATTENDANT"
      ? [{ label: "Estoque", href: "/painel/estoque", icon: "stock" as const }]
      : []),
    { label: "Financeiro", href: "/painel/financeiro", icon: "finance", managerOnly: true },
    { label: "Relatórios", href: "/painel/relatorios", icon: "reports", managerOnly: true },
    { label: "Serviços", href: "/painel/servicos", icon: "services" },
    { label: "Minha assistência", href: "/painel/empresa", icon: "business", managerOnly: true },
    { label: "Minha página", href: "/painel/minha-pagina", icon: "publicPage", managerOnly: true },
    { label: "Equipe", href: "/painel/equipe", icon: "team", managerOnly: true },
    { label: "Configurações", href: "/painel/configuracoes", icon: "settings", managerOnly: true },
    { label: "Perfil", href: "/painel/perfil", icon: "profile" },
    { label: "Ajuda", href: "/painel/ajuda", icon: "help" },
  ].filter(
    (item) =>
      !item.managerOnly ||
      ["OWNER", "ADMIN"].includes(access.company?.role || ""),
  );

  const mobilePrimaryActive = (href: string) => {
    if (href === "/painel") return path === "/painel";
    if (href === "/painel/ordens")
      return (
        path === "/painel/ordens" ||
        (path.startsWith("/painel/ordens/") &&
          path !== "/painel/ordens/nova")
      );
    return path === href || path.startsWith(href + "/");
  };

  const mobileMoreActive =
    mobileMoreOpen ||
    mobileMoreLinks.some(
      (item) =>
        path === item.href ||
        (item.href !== "/painel" && path.startsWith(item.href + "/")),
    ) ||
    path === "/painel/ordens/nova";

  return (
    <div className="workspace">
      <header className="mobile-top">
        <Brand />
        <button
          aria-label="Abrir menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          ☰
        </button>
      </header>
      {open && (
        <button
          className="nav-scrim"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`main-sidebar ${open ? "is-open" : ""}`}>
        <Brand />
        <div className="workspace-company">
          <span
            className={
              "workspace-company-avatar " +
              (empresa?.logo_url ? "has-logo" : "")
            }
            aria-hidden="true"
          >
            {empresa?.logo_url ? (
              <Image
                src={empresa.logo_url}
                alt=""
                width={34}
                height={34}
                unoptimized
              />
            ) : (
              empresa?.nome.slice(0, 1).toUpperCase() || "H"
            )}
          </span>
          <div>
            <strong>{empresa?.nome || "Sua assistência"}</strong>
            <small>Gestão técnica</small>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          {menu.map(([group, items]) => (
            <section key={group}>
              <h2>{group}</h2>
              {items
                .filter(
                  ([, href]) =>
                    !(
                      (href === "/painel/agenda" &&
                        !access.company?.featureFlags.appointmentsEnabled) ||
                      (href === "/painel/estoque" &&
                        access.company?.role === "ATTENDANT") ||
                      ([
                        "/painel/financeiro",
                        "/painel/relatorios",
                        "/painel/configuracoes",
                        "/painel/equipe",
                        "/painel/minha-pagina",
                        "/painel/empresa",
                      ].includes(href) &&
                        !["OWNER", "ADMIN"].includes(
                          access.company?.role || "",
                        ))
                    ),
                )
                .map(([label, href, icon]) => (
                  <Link
                    key={href}
                    href={href}
                    prefetch={eagerMenuRoutes.has(href)}
                    onMouseEnter={() => {
                      if (!eagerMenuRoutes.has(href)) router.prefetch(href);
                    }}
                    onFocus={() => {
                      if (!eagerMenuRoutes.has(href)) router.prefetch(href);
                    }}
                    className={href === activeMenuHref ? "current" : ""}
                  >
                    <span className="sidebar-nav-icon" aria-hidden="true">
                      <HorariaIcon name={icon} />
                    </span>
                    {label}
                  </Link>
                ))}
            </section>
          ))}
        </nav>
        <footer>
          <Link href="/painel/perfil">
            <HorariaIcon name="profile" />
            <span>Perfil</span>
          </Link>
          <Link href="/painel/ajuda">
            <HorariaIcon name="help" />
            <span>Ajuda</span>
          </Link>
          <button
            onClick={async () => {
              const r = await supabase!.auth.signOut();
              if (r.error) setError(message(r.error));
              else {
                await syncServerSession(null);
                router.replace("/");
              }
            }}
          >
            <HorariaIcon name="logout" />
            <span>Sair</span>
          </button>
        </footer>
      </aside>
      <main className="workspace-main">
        <header className="workspace-top">
          <form className="workspace-global-search" onSubmit={submitGlobalSearch}>
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Buscar área do sistema"
              placeholder="Buscar cliente, OS, equipamento, serviço..."
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
            />
          </form>
          <div className="workspace-top-context">
            <div className="workspace-top-popover-wrap">
              <div
                className="workspace-date-chip"
                role="status"
                aria-label="Data e hora atual"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="workspace-calendar-icon"
                >
                  <path d="M7 2v3M17 2v3M3.5 9h17M5.5 4h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
                </svg>
                <span>{liveDateTime || "—"}</span>
              </div>
            </div>

            <div className="workspace-top-popover-wrap">
              <button
                className="workspace-alert-button"
                aria-label="Notificações"
                aria-expanded={alertsOpen}
                type="button"
                onClick={() => {
                  setAlertsOpen(!alertsOpen);
                            setProfileOpen(false);
                }}
              >
                <svg
                  className="workspace-bell-icon"
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                >
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" />
                </svg>
                {unreadAlerts.length > 0 && (
                  <span className="workspace-alert-count">
                    {Math.min(unreadAlerts.length, 9)}
                  </span>
                )}
              </button>
              {alertsOpen && (
                <div className="workspace-popover workspace-alert-popover">
                  <div className="workspace-popover-head">
                    <div>
                      <strong>Notificações</strong>
                      <small>
                        {unreadAlerts.length
                          ? `${unreadAlerts.length} não lidas`
                          : "Tudo em dia"}
                      </small>
                    </div>
                    {unreadAlerts.length > 0 && (
                      <button
                        className="workspace-mark-all"
                        type="button"
                        onClick={() => void markAllAlertsRead()}
                      >
                        Marcar todas como lidas
                      </button>
                    )}
                  </div>
                  {alerts.length ? (
                    <div className="workspace-alert-list">
                      {alerts.map((alert) => {
                        const read = readAlertIds.has(alert.id);
                        return (
                          <Link
                            href={alert.href}
                            key={alert.id}
                            className={
                              "workspace-alert-item " +
                              alert.tone +
                              (read ? " is-read" : " is-unread")
                            }
                            onClick={() => {
                              void markAlertRead(alert.id);
                              setAlertsOpen(false);
                            }}
                          >
                            <span />
                            <div>
                              <strong>{alert.title}</strong>
                              <small>{alert.text}</small>
                              <time>
                                {new Date(alert.createdAt).toLocaleString(
                                  "pt-BR",
                                  {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                    timeZone: "America/Sao_Paulo",
                                  },
                                )}
                              </time>
                            </div>
                            {!read && <b aria-label="Não lida" />}
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="workspace-popover-empty">
                      Nenhuma notificação agora.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="workspace-top-popover-wrap" ref={profileMenuRef}>
              <button
                className="workspace-profile-chip"
                type="button"
                aria-expanded={profileOpen}
                onClick={() => {
                  setProfileOpen(!profileOpen);
                            setAlertsOpen(false);
                }}
              >
                <span
                  className={
                    "workspace-profile-avatar " +
                    (empresa?.logo_url ? "has-logo" : "")
                  }
                  aria-hidden="true"
                >
                  {empresa?.logo_url ? (
                    <Image
                      src={empresa.logo_url}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                    />
                  ) : (
                    empresa?.nome?.slice(0, 2).toUpperCase() || "H"
                  )}
                </span>
                <div>
                  <strong>{empresa?.nome || "Sua assistência"}</strong>
                  <small>Gestor da loja</small>
                </div>
                <b>⌄</b>
              </button>
              {profileOpen && (
                <div className="workspace-popover workspace-profile-menu">
                  <div>
                    <strong>{empresa?.nome || "Sua assistência"}</strong>
                    <small>{email}</small>
                  </div>
                  <Link href="/painel/perfil" onClick={() => setProfileOpen(false)}>
                    <HorariaIcon name="profile" />
                    <span>Meu perfil</span>
                  </Link>
                  {["OWNER", "ADMIN"].includes(access.company?.role || "") && (
                    <>
                      <Link href="/painel/equipe" onClick={() => setProfileOpen(false)}>
                        <HorariaIcon name="team" />
                        <span>Equipe</span>
                      </Link>
                      <Link href="/painel/configuracoes" onClick={() => setProfileOpen(false)}>
                        <HorariaIcon name="settings" />
                        <span>Configurações</span>
                      </Link>
                      <Link href="/painel/empresa" onClick={() => setProfileOpen(false)}>
                        <HorariaIcon name="business" />
                        <span>Minha assistência</span>
                      </Link>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await supabase!.auth.signOut();
                      if (result.error) setError(message(result.error));
                      else {
                        await syncServerSession(null);
                        router.replace("/");
                      }
                    }}
                  >
                    <HorariaIcon name="logout" />
                    <span>Sair</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <nav className="workspace-breadcrumbs" aria-label="Navegação estrutural">
          <Link href="/painel">Painel</Link>
          {path !== "/painel" && (
            <>
              <span aria-hidden="true">›</span>
              <span aria-current="page">{title}</span>
            </>
          )}
        </nav>
        {error && (
          <div className="notice" role="alert">
            {error}
            <button onClick={refresh}>Tentar novamente</button>
          </div>
        )}
        {access.subscription?.status === "PAST_DUE" && (
          <div className="notice subscription-warning">
            <div>
              <strong>
                Não conseguimos confirmar o pagamento da sua assinatura.
              </strong>
              <span>Seus dados permanecem seguros.</span>
            </div>
            <Link className="outline" href="/painel/assinatura">
              Regularizar assinatura
            </Link>
          </div>
        )}
        {access.subscription?.status === "TRIAL" &&
          access.subscription.trialEndsAt && (
            <div className="trial-banner">
              Período inicial até{" "}
              {new Date(access.subscription.trialEndsAt).toLocaleDateString(
                "pt-BR",
              )}
              .
            </div>
          )}
        {loading ? (
          <div className="empty">Carregando sua assistência…</div>
        ) : !userId ? null : !empresa ? (
          <Setup done={refresh} />
        ) : (
          <Context.Provider
            value={{
              empresa,
              userId,
              email,
              access,
              selectedMonth,
              setSelectedMonth,
              periodStart,
              periodEnd,
              setPeriod,
              refresh,
            }}
          >
            {children}
          </Context.Provider>
        )}
      </main>
      {empresa && userId && !loading && (
        <>
          {mobileMoreOpen && (
            <>
              <button
                className="mobile-bottom-scrim"
                type="button"
                aria-label="Fechar menu Mais"
                onClick={() => setMobileMoreOpen(false)}
              />
              <section
                className="mobile-more-sheet"
                aria-label="Mais áreas do sistema"
              >
                <div className="mobile-more-sheet-head">
                  <div>
                    <strong>Mais</strong>
                    <small>Acesse as outras áreas do Horária.</small>
                  </div>
                  <button
                    type="button"
                    aria-label="Fechar"
                    onClick={() => setMobileMoreOpen(false)}
                  >
                    ×
                  </button>
                </div>
                <div className="mobile-more-grid">
                  {mobileMoreLinks.map((item) => (
                    <Link
                      href={item.href}
                      key={item.href}
                      className={
                        path === item.href ||
                        (item.href !== "/painel" &&
                          path.startsWith(item.href + "/"))
                          ? "is-current"
                          : ""
                      }
                      onClick={() => setMobileMoreOpen(false)}
                    >
                      <span className="mobile-more-icon" aria-hidden="true">
                        <HorariaIcon name={item.icon} />
                      </span>
                      <strong>{item.label}</strong>
                    </Link>
                  ))}
                </div>
              </section>
            </>
          )}
          <nav
            className="mobile-bottom-nav"
            aria-label="Navegação rápida no celular"
          >
            {mobilePrimaryNav.map((item) => {
              const active = mobilePrimaryActive(item.href);
              return (
                <Link
                  href={item.href}
                  key={item.href}
                  className={active ? "is-current" : ""}
                  aria-current={active ? "page" : undefined}
                >
                  <HorariaIcon name={item.icon} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              type="button"
              className={mobileMoreActive ? "is-current" : ""}
              aria-expanded={mobileMoreOpen}
              onClick={() => {
                setMobileMoreOpen((current) => !current);
                setAlertsOpen(false);
                setProfileOpen(false);
              }}
            >
              <HorariaIcon name="more" />
              <span>Mais</span>
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
