import Link from "next/link";
import { Status, statuses } from "@/lib/assistencia";
import { HorariaIcon, type HorariaIconName } from "./horaria-icon";
const headingIconByTitle: Record<string, HorariaIconName> = {
  "Visão geral": "home",
  "Nova ordem de serviço": "receive",
  "Central de Atendimento": "central",
  Agenda: "calendar",
  "Ordens de serviço": "orders",
  Clientes: "clients",
  Equipamentos: "devices",
  Estoque: "stock",
  Financeiro: "finance",
  Relatórios: "reports",
  Serviços: "services",
  "Minha assistência": "business",
  "Minha página": "publicPage",
  "Página do cliente": "publicPage",
  "Equipe e permissões": "team",
  Configurações: "settings",
  Perfil: "profile",
  Ajuda: "help",
};

export function Heading({
  title,
  subtitle,
  action,
  href,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  href?: string;
  icon?: HorariaIconName;
}) {
  const iconName = icon || headingIconByTitle[title];

  return (
    <div className="module-heading">
      <div>
        <span className="eyebrow">HORÁRIA / ASSISTÊNCIA TÉCNICA</span>
        <div className="module-heading-title">
          {iconName && (
            <span className="module-heading-icon" aria-hidden="true">
              <HorariaIcon name={iconName} />
            </span>
          )}
          <h1>{title}</h1>
        </div>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && href && (
        <Link className="primary" href={href}>
          {action}
        </Link>
      )}
    </div>
  );
}
export function Badge({ status }: { status: Status }) {
  return (
    <span className="ui-badge status-pill" data-status={status}>
      {statuses[status]}
    </span>
  );
}
export function Empty({
  title = "Ainda não há registros.",
  text,
  href,
  action,
}: {
  title?: string;
  text?: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {text && <p>{text}</p>}
      {href && (
        <Link className="outline" href={href}>
          {action || "Começar"}
        </Link>
      )}
    </div>
  );
}
export function ErrorBox({ error }: { error?: string }) {
  return error ? (
    <p className="notice error" role="alert">
      {error}
    </p>
  ) : null;
}

export type SemanticTone =
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "purple";

export type MetricCardTone =
  | SemanticTone
  | "blue"
  | "green"
  | "amber"
  | "red";

function normalizeTone(tone: MetricCardTone): SemanticTone {
  if (tone === "blue") return "primary";
  if (tone === "green") return "success";
  if (tone === "amber") return "warning";
  if (tone === "red") return "danger";
  return tone;
}

export function MetricGrid({
  children,
  columns = 4,
  className = "",
}: {
  children: React.ReactNode;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      className={`ui-metric-grid ${className}`.trim()}
      style={{ "--ui-metric-columns": columns } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  note,
  icon,
  iconName,
  tone = "primary",
  active = true,
  emphasizeValue = false,
  afterValue,
  footer,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  icon?: React.ReactNode;
  iconName?: HorariaIconName;
  tone?: MetricCardTone;
  active?: boolean;
  emphasizeValue?: boolean;
  afterValue?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  const semanticTone = active ? normalizeTone(tone) : "neutral";

  return (
    <article
      className={`ui-metric-card tone-${semanticTone}${
        active && emphasizeValue ? " metric-value-accent" : ""
      } ${className}`.trim()}
    >
      <span className="ui-metric-icon" aria-hidden="true">
        {iconName ? <HorariaIcon name={iconName} /> : icon}
      </span>
      <div className="ui-metric-content">
        <div className="ui-metric-value-row">
          <strong>{value}</strong>
          {afterValue}
        </div>
        <b>{label}</b>
        {note && <small>{note}</small>}
        {footer && <div className="ui-metric-footer">{footer}</div>}
      </div>
    </article>
  );
}

export function PanelTitle({
  title,
  icon,
  subtitle,
  as = "h2",
}: {
  title: string;
  icon: HorariaIconName;
  subtitle?: string;
  as?: "h2" | "h3";
}) {
  const Title = as;
  return (
    <div className="panel-title-wrap">
      <span className="panel-title-icon" aria-hidden="true">
        <HorariaIcon name={icon} />
      </span>
      <div>
        <Title>{title}</Title>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </div>
  );
}

export function SemanticBadge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: React.ReactNode;
  tone?: SemanticTone;
  className?: string;
}) {
  return (
    <span className={`ui-badge tone-${tone} ${className}`.trim()}>
      {children}
    </span>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}


export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, page * pageSize);

  return (
    <nav className="data-pagination" aria-label="Paginação">
      <span>
        {start}–{end} de {total}
      </span>
      <div>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          ← Anterior
        </button>
        <strong>
          Página {page} de {pages}
        </strong>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(pages, page + 1))}
          disabled={page >= pages}
        >
          Próxima →
        </button>
      </div>
    </nav>
  );
}
