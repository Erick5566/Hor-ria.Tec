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
