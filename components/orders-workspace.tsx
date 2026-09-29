"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Heading } from "./ui";
import ViewNavigation from "./view-navigation";
import { HorariaIcon } from "./horaria-icon";
import { useWorkspace } from "./workspace";

const loading = () => <p role="status">Carregando ordens…</p>;
const OrdersList = dynamic(() => import("./orders-list"), { loading });
const RepairBench = dynamic(() => import("./repair-bench"), { loading });

export default function OrdersWorkspace({
  view,
  query,
}: {
  view: "lista" | "bancada";
  query?: string;
}) {
  const { access } = useWorkspace();
  const manager = ["OWNER", "ADMIN"].includes(access.company?.role || "");
  const search = query ? `&q=${encodeURIComponent(query)}` : "";
  return (
    <section className="module consolidated-orders">
      <Heading
        title="Ordens de serviço"
        subtitle="Todos os atendimentos em um só lugar."
        action="+ Nova ordem"
        href="/painel/ordens/nova"
      />
      <ViewNavigation
        label="Visualização das ordens"
        items={[
          {
            label: "Lista",
            href: `/painel/ordens?visao=lista${search}`,
            icon: "orders",
            active: view === "lista",
          },
          {
            label: "Bancada",
            href: `/painel/ordens?visao=bancada${search}`,
            icon: "central",
            active: view === "bancada",
          },
        ]}
      />
      {view === "lista" ? (
        <OrdersList />
      ) : (
        <RepairBench key={query} compact initialQuery={query} />
      )}
      {manager && (
        <div className="consolidated-shortcuts">
          <Link href="/painel/financeiro">
            <HorariaIcon name="finance" />
            <div>
              <strong>Financeiro</strong>
              <span>Movimentações e relatórios no mesmo lugar.</span>
            </div>
            <span aria-hidden="true">›</span>
          </Link>
          <Link href="/painel/minha-pagina">
            <HorariaIcon name="publicPage" />
            <div>
              <strong>Minha página</strong>
              <span>Personalize, visualize e copie o link público.</span>
            </div>
            <span aria-hidden="true">›</span>
          </Link>
        </div>
      )}
    </section>
  );
}
