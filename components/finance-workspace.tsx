"use client";
import dynamic from "next/dynamic";
import { useWorkspace } from "./workspace";
import ViewNavigation from "./view-navigation";

const loading = () => <p role="status">Carregando financeiro…</p>;
const Finance = dynamic(() => import("./finance"), { loading });
const Reports = dynamic(() => import("./reports"), { loading });

export default function FinanceWorkspace({ view }: { view: string }) {
  const { access } = useWorkspace();
  if (!["OWNER", "ADMIN"].includes(access.company?.role || "")) {
    return (
      <section className="panel">
        <h2>Acesso restrito</h2>
        <p>Esta área está disponível aos gestores da assistência.</p>
      </section>
    );
  }
  const reports = view === "relatorios";
  return (
    <div className="consolidated-finance">
      <ViewNavigation
        label="Áreas do financeiro"
        items={[
          {
            label: "Movimentações",
            href: "/painel/financeiro",
            icon: "finance",
            active: !reports,
          },
          {
            label: "Relatórios",
            href: "/painel/financeiro?visao=relatorios",
            icon: "reports",
            active: reports,
          },
        ]}
      />
      {reports ? <Reports /> : <Finance />}
    </div>
  );
}
