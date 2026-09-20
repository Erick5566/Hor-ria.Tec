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
    <span className="status-pill" data-status={status}>
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
