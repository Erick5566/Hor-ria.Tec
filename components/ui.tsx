import Link from "next/link";
import { Status, statuses } from "@/lib/assistencia";
export function Heading({
  title,
  subtitle,
  action,
  href,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="module-heading">
      <div>
        <span className="eyebrow">HORÁRIA / ASSISTÊNCIA TÉCNICA</span>
        <h1>{title}</h1>
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
  icon: React.ReactNode;
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
        {icon}
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
