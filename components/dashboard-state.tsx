import type { ReactNode } from "react";
import { HorariaIcon } from "./horaria-icon";
import { priorityLabels, type Priority } from "@/lib/dashboard";

export function PriorityBadge({
  priority = "normal",
}: {
  priority?: Priority;
}) {
  return (
    <span className={`dashboard-priority-badge ${priority}`}>
      <HorariaIcon
        name={
          priority === "urgente" || priority === "alta"
            ? "alert"
            : priority === "baixa"
              ? "clock"
              : "orders"
        }
      />
      {priorityLabels[priority] || priorityLabels.normal}
    </span>
  );
}

export function DashboardContent({
  loading,
  error,
  hasData,
  retry,
  children,
}: {
  loading: boolean;
  error: string;
  hasData: boolean;
  retry: () => void;
  children: ReactNode;
}) {
  if (loading && !hasData)
    return (
      <div className="dashboard-block-state" role="status">
        Carregando dados…
      </div>
    );
  if (error && !hasData)
    return (
      <div className="dashboard-block-state" role="alert">
        <p>{error}</p>
        <button type="button" onClick={retry}>
          Tentar novamente
        </button>
      </div>
    );
  return (
    <>
      {error && (
        <div className="dashboard-refresh-error" role="alert">
          Não foi possível atualizar. Exibindo os últimos dados.{" "}
          <button type="button" onClick={retry}>
            Tentar novamente
          </button>
        </div>
      )}
      {children}
    </>
  );
}
