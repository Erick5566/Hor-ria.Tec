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
  refresh: () => Promise<void>;
};
const Context = createContext<WorkspaceValue | null>(null);
export function useWorkspace() {
  const value = useContext(Context);
  if (!value) throw new Error("Workspace ausente");
  return value;
}
export const menu = [
  ["VISÃO GERAL", [["Dashboard", "/painel", "▦"]]],
  [
    "OPERAÇÃO",
    [
      ["Mesa de reparo", "/painel/mesa-reparo", "▦"],
      ["Ordens de serviço", "/painel/ordens", "▤"],
      ["Agenda", "/painel/agenda", "◷"],
      ["Clientes", "/painel/clientes", "♙"],
      ["Equipamentos", "/painel/equipamentos", "▣"],
      ["Orçamentos", "/painel/orcamentos", "▧"],
    ],
  ],
  [
    "GESTÃO",
    [
      ["Serviços", "/painel/servicos", "⌘"],
      ["Financeiro", "/painel/financeiro", "＄"],
    ],
  ],
  [
    "CONFIGURAÇÕES",
    [
      ["Minha página", "/painel/minha-pagina", "↗"],
      ["Minha assistência", "/painel/empresa", "▢"],
      ["Aparência", "/painel/empresa#aparencia", "◐"],
      ["Configurações", "/painel/configuracoes", "⚙"],
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
    [globalSearch, setGlobalSearch] = useState("");
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
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  if (!configured) return <MissingConfig />;
  const title =
    menu
      .reduce<ReadonlyArray<readonly [string, string, string]>>(
        (all, g) => [...all, ...g[1]],
        [],
      )
      .find((item) => item[1] === path)?.[0] || "Assistência técnica";

  function submitGlobalSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = globalSearch.trim().toLowerCase();
    if (!query) return;
    const destinations = [
      { words: ["cliente", "clientes"], href: "/painel/clientes" },
      { words: ["equipamento", "equipamentos", "aparelho"], href: "/painel/equipamentos" },
      { words: ["orçamento", "orcamento", "proposta"], href: "/painel/orcamentos" },
      { words: ["agenda", "agendamento", "horário", "horario"], href: "/painel/agenda" },
      { words: ["serviço", "servico", "serviços", "servicos"], href: "/painel/servicos" },
      { words: ["financeiro", "finança", "financas", "receita"], href: "/painel/financeiro" },
      { words: ["mesa", "reparo"], href: "/painel/mesa-reparo" },
    ];
    const destination = destinations.find((item) =>
      item.words.some((word) => query.includes(word)),
    );
    router.push(destination?.href || "/painel/ordens");
    setGlobalSearch("");
  }
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
            <span className="workspace-breadcrumb">
              Horária <span>/ {title}</span>
            </span>
            <div className="workspace-profile-chip">
              <span>{empresa?.nome?.slice(0, 2).toUpperCase() || "H"}</span>
              <div>
                <strong>{empresa?.nome || "Sua assistência"}</strong>
                <small>{email || "Gestão técnica"}</small>
              </div>
              <b>⌄</b>
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
          <Context.Provider value={{ empresa, userId, email, access, refresh }}>
            {children}
          </Context.Provider>
        )}
      </main>
    </div>
  );
}
