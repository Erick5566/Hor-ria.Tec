import { Heading } from "./ui";
type Audit = {
  id: number;
  action: string;
  companyId?: string;
  company?: string;
  reason?: string;
  details: Record<string, unknown>;
  createdAt: string;
  actorEmail?: string;
};
export default function AdminAudit({ entries }: { entries: Audit[] }) {
  return (
    <section className="module admin-module">
      <Heading
        title="Auditoria administrativa"
        subtitle="Registro das ações sensíveis realizadas na plataforma."
      />
      <section className="panel">
        <div className="audit-list">
          {entries.map((entry) => (
            <article key={entry.id}>
              <span>{new Date(entry.createdAt).toLocaleString("pt-BR")}</span>
              <div>
                <strong>{entry.action}</strong>
                <p>{entry.company || "Configuração da plataforma"}</p>
                <small>
                  {entry.actorEmail || "Sistema"}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
