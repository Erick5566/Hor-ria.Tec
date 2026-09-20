"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import Link from "next/link";
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
type WorkspaceValue = {
  empresa: Empresa;
  userId: string;
  email: string;
  access: AccessContext;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  refresh: () => Promise<void>;
};
type WorkspaceAlert = {
  id: string;
  title: string;
  text: string;
  href: string;
  tone: "urgent" | "warning" | "ready";
};

function localMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  })
    .format(new Date())
    .slice(0, 7);
}

const Context = createContext<WorkspaceValue | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace ausente");
  return value;
}
export const menu = [
  [
    "PRINCIPAL",
    [
      ["Painel", "/painel", "⌂"],
      ["Ordens de serviço", "/painel/ordens", "▤"],
      ["Recebimento", "/painel/ordens/nova", "◷"],
      ["Diagnósticos", "/painel/mesa-reparo", "⌕"],
      ["Agenda", "/painel/agenda", "▦"],
      ["Clientes", "/painel/clientes", "♙"],
      ["Equipamentos", "/painel/equipamentos", "▣"],
      ["Estoque", "/painel/estoque", "▧"],
      ["Financeiro", "/painel/financeiro", "＄"],
      ["Relatórios", "/painel/relatorios", "◫"],
      ["Serviços", "/painel/servicos", "⌘"],
      ["Configurações", "/painel/configuracoes", "⚙"],
    ],
  ],
  [
    "EMPRESA",
    [
      ["Minha página", "/painel/minha-pagina", "↗"],
      ["Minha assistência", "/painel/empresa", "▢"],
    ],
  ],
] as const;
export default function Workspace({
  children,
  initialAccess,
}: {
  children: React.ReactNode;
  initialAccess: AccessContext;
}) {
  const [empresa, setEmpresa] = useState<Empresa | null>(null),
    [access, setAccess] = useState(initialAccess),
    [userId, setUserId] = useState(""),
    [email, setEmail] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [globalSearch, setGlobalSearch] = useState(""),
    [selectedMonth, setSelectedMonth] = useState(localMonth()),
    [periodOpen, setPeriodOpen] = useState(false),
    [alertsOpen, setAlertsOpen] = useState(false),
    [profileOpen, setProfileOpen] = useState(false),
    [alerts, setAlerts] = useState<WorkspaceAlert[]>([]);
  const router = useRouter(),
    path = usePathname();
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
      await supabase.rpc("registrar_acesso");
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setLoading(false);
    }
  }, [router]);
  useEffect(() => {
    refresh();
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
    return () => data?.subscription.unsubscribe();
  }, [refresh, router]);
  useEffect(() => {
    setOpen(false);
  }, [path]);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPeriodOpen(false);
        setAlertsOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  useEffect(() => {
    if (!empresa?.id || !supabase) return;
    let active = true;
    async function loadAlerts() {
      const { data, error } = await supabase!
        .from("ordens_servico")
        .select("id,numero,status,prioridade,prazo_previsto")
        .eq("empresa_id", empresa!.id)
        .not("status", "in", '("finalizado","cancelado")')
        .order("prazo_previsto", { ascending: true, nullsFirst: false })
        .limit(40);
      if (error || !active) return;

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date());

      const next: WorkspaceAlert[] = [];
      for (const order of data || []) {
        if (order.prioridade === "urgente") {
          next.push({
            id: "urgent-" + order.id,
            title: `OS #${order.numero} urgente`,
            text: "Esta ordem está marcada como prioridade urgente.",
            href: `/painel/ordens/${order.id}`,
            tone: "urgent",
          });
        }
        if (
          order.prazo_previsto &&
          order.prazo_previsto.slice(0, 10) < today
        ) {
          next.push({
            id: "late-" + order.id,
            title: `OS #${order.numero} atrasada`,
            text: "O prazo previsto desta ordem já passou.",
            href: `/painel/ordens/${order.id}`,
            tone: "warning",
          });
        }
        if (order.status === "pronto_retirada") {
          next.push({
            id: "ready-" + order.id,
            title: `OS #${order.numero} pronta`,
            text: "Equipamento pronto para retirada.",
            href: `/painel/ordens/${order.id}`,
            tone: "ready",
          });
        }
      }
      setAlerts(next.slice(0, 12));
    }
    void loadAlerts();
    const timer = window.setInterval(loadAlerts, 60000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [empresa?.id]);
  if (!configured) return <MissingConfig />;
  const title =
    menu
      .reduce<ReadonlyArray<readonly [string, string, string]>>(
        (all, g) => [...all, ...g[1]],
        [],
      )
      .find((item) => item[1] === path)?.[0] || "Assistência técnica";

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
      { words: ["diagnósticos", "diagnosticos", "mesa de reparo"], href: "/painel/mesa-reparo" },
      { words: ["recebimento", "nova ordem"], href: "/painel/ordens/nova" },
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

  const [periodYear, periodMonth] = selectedMonth.split("-").map(Number);
  const monthStart = new Date(periodYear, periodMonth - 1, 1);
  const monthEnd = new Date(periodYear, periodMonth, 0);
  const periodLabel =
    monthStart.toLocaleDateString("pt-BR") +
    " - " +
    monthEnd.toLocaleDateString("pt-BR");

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
          <span>{empresa?.nome.slice(0, 1) || "H"}</span>
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
                      (href === "/painel/minha-pagina" &&
                        !["OWNER", "ADMIN"].includes(
                          access.company?.role || "",
                        ))
                    ),
                )
                .map(([label, href, icon]) => (
                  <Link
                    key={href}
                    href={href}
                    className={
                      path === href ||
                      (href !== "/painel" && path.startsWith(href + "/"))
                        ? "current"
                        : ""
                    }
                  >
                    <span aria-hidden="true">{icon}</span>
                    {label}
                  </Link>
                ))}
            </section>
          ))}
        </nav>
        <Link className="sidebar-promo" href="/painel">
          <span className="sidebar-promo-icon">✦</span>
          <div>
            <strong>Seu negócio mais organizado e lucrativo.</strong>
            <small>Horária · Gestão para assistência técnica.</small>
          </div>
          <b>→</b>
        </Link>
        <footer>
          <Link href="/painel/perfil">♙ Perfil</Link>
          <Link href="/painel/ajuda">? Ajuda</Link>
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
            ↪ Sair
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
              <button
                className="workspace-date-chip"
                type="button"
                aria-expanded={periodOpen}
                onClick={() => {
                  setPeriodOpen(!periodOpen);
                  setAlertsOpen(false);
                  setProfileOpen(false);
                }}
              >
                <b aria-hidden="true">▣</b>
                {periodLabel}
                <i aria-hidden="true">⌄</i>
              </button>
              {periodOpen && (
                <div className="workspace-popover workspace-period-popover">
                  <strong>Período do painel</strong>
                  <label>
                    Mês
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(event) => {
                        setSelectedMonth(event.target.value || localMonth());
                        setPeriodOpen(false);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMonth(localMonth());
                      setPeriodOpen(false);
                    }}
                  >
                    Voltar ao mês atual
                  </button>
                </div>
              )}
            </div>

            <div className="workspace-top-popover-wrap">
              <button
                className="workspace-alert-button"
                aria-label="Notificações"
                aria-expanded={alertsOpen}
                type="button"
                onClick={() => {
                  setAlertsOpen(!alertsOpen);
                  setPeriodOpen(false);
                  setProfileOpen(false);
                }}
              >
                ♢
                {alerts.length > 0 && (
                  <span className="workspace-alert-count">
                    {Math.min(alerts.length, 9)}
                  </span>
                )}
              </button>
              {alertsOpen && (
                <div className="workspace-popover workspace-alert-popover">
                  <div className="workspace-popover-head">
                    <strong>Notificações</strong>
                    <small>{alerts.length} avisos</small>
                  </div>
                  {alerts.length ? (
                    <div className="workspace-alert-list">
                      {alerts.map((alert) => (
                        <Link
                          href={alert.href}
                          key={alert.id}
                          className={"workspace-alert-item " + alert.tone}
                          onClick={() => setAlertsOpen(false)}
                        >
                          <span />
                          <div>
                            <strong>{alert.title}</strong>
                            <small>{alert.text}</small>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="workspace-popover-empty">
                      Nenhum aviso importante agora.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="workspace-top-popover-wrap">
              <button
                className="workspace-profile-chip"
                type="button"
                aria-expanded={profileOpen}
                onClick={() => {
                  setProfileOpen(!profileOpen);
                  setPeriodOpen(false);
                  setAlertsOpen(false);
                }}
              >
                <span>{empresa?.nome?.slice(0, 2).toUpperCase() || "H"}</span>
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
                    ♙ Meu perfil
                  </Link>
                  <Link href="/painel/configuracoes" onClick={() => setProfileOpen(false)}>
                    ⚙ Configurações
                  </Link>
                  <Link href="/painel/empresa" onClick={() => setProfileOpen(false)}>
                    ▢ Minha assistência
                  </Link>
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
                    ↪ Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
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
          <Context.Provider value={{ empresa, userId, email, access, selectedMonth, setSelectedMonth, refresh }}>
            {children}
          </Context.Provider>
        )}
      </main>
    </div>
  );
}
