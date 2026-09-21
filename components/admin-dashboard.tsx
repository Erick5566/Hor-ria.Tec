"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox, Heading } from "./ui";

export type AdminCompany = {
  id: string;
  name: string;
  slug: string;
  responsible: string;
  email: string;
  phone?: string | null;
  createdAt: string;
  plan?: string | null;
  subscriptionStatus?: string | null;
  nextBillingDate?: string | null;
  lastAccessAt?: string | null;
  usersCount: number;
  customersCount: number;
  ordersCount: number;
  storageBytes: number;
  status: string;
  maintenance: boolean;
  scheduledDeletionAt?: string | null;
};
export type PlatformOverview = {
  globalMaintenance: boolean;
  maintenanceMessage?: string | null;
  registrationEnabled: boolean;
  maxCompanies: number;
  currentCompanies: number;
  publicAppUrl?: string | null;
  featureFlags: Record<string, boolean>;
};
const statusLabel: Record<string, string> = {
  ACTIVE: "Ativa",
  TRIAL: "Em teste",
  PAST_DUE: "Pagamento pendente",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
  PENDING_DELETION: "Aguardando exclusão",
};
const size = (bytes: number) =>
  bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "0 MB";
const featureNames: Record<string, string> = {
  aiEnabled: "Inteligência artificial",
  financialEnabled: "Financeiro",
  stockEnabled: "Estoque",
  whatsappEnabled: "WhatsApp",
  appointmentsEnabled: "Agenda",
};

function normalizePublicUrl(value?: string | null) {
  const raw = value?.trim();
  if (!raw || /[^\x00-\x7F]/.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return "";
    return url.origin;
  } catch {
    return "";
  }
}

export default function AdminDashboard({
  initialCompanies,
  initialOverview,
  settingsOnly = false,
}: {
  initialCompanies: AdminCompany[];
  initialOverview: PlatformOverview;
  settingsOnly?: boolean;
}) {
  const router = useRouter();
  const [overview, setOverview] = useState(initialOverview),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const companies = useMemo(
    () =>
      initialCompanies.filter((company) =>
        JSON.stringify(company)
          .toLocaleLowerCase("pt-BR")
          .includes(search.toLocaleLowerCase("pt-BR")),
      ),
    [initialCompanies, search],
  );
  async function savePlatform(
    changes: Record<string, unknown>,
    reason: string,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    const result = await supabase!.rpc("admin_update_platform", {
      p_changes: changes,
      p_reason: reason,
    });
    setBusy(false);
    if (result.error) setError(message(result.error));
    else {
      setNotice("Configuração atualizada e registrada na auditoria.");
      setOverview({ ...overview, ...changes });
      router.refresh();
    }
  }
  const browserOrigin =
    typeof location === "undefined" ? "" : location.origin;
  const configuredAppUrl = normalizePublicUrl(overview.publicAppUrl);
  const appUrl = configuredAppUrl || browserOrigin;
  return (
    <section className="module admin-module">
      <Heading
        title={
          settingsOnly ? "Configurações da plataforma" : "Empresas da Horária"
        }
        subtitle={
          settingsOnly
            ? "Controle de acesso, vagas e disponibilidade geral."
            : "Acompanhe as assistências cadastradas sem acessar diretamente seus dados operacionais."
        }
      />
      <ErrorBox error={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!settingsOnly && (
        <>
          <div className="metrics admin-metrics">
            <article>
              <span>Empresas</span>
              <h2>{overview.currentCompanies}</h2>
              <small>de {overview.maxCompanies} vagas</small>
            </article>
            <article>
              <span>Ativas</span>
              <h2>
                {
                  initialCompanies.filter((x) =>
                    ["ACTIVE", "TRIAL"].includes(x.status),
                  ).length
                }
              </h2>
              <small>incluindo período inicial</small>
            </article>
            <article>
              <span>Pagamento pendente</span>
              <h2>
                {initialCompanies.filter((x) => x.status === "PAST_DUE").length}
              </h2>
              <small>dados preservados</small>
            </article>
            <article>
              <span>Suspensas</span>
              <h2>
                {
                  initialCompanies.filter((x) => x.status === "SUSPENDED")
                    .length
                }
              </h2>
              <small>acesso bloqueado</small>
            </article>
          </div>
          <section className="panel">
            <div className="toolbar">
              <input
                aria-label="Buscar empresas"
                placeholder="Buscar empresa, responsável ou e-mail…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Responsável</th>
                    <th>Plano / assinatura</th>
                    <th>Uso</th>
                    <th>Último acesso</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id}>
                      <td>
                        <strong>{company.name}</strong>
                        <small>
                          /{company.slug} ·{" "}
                          {new Date(company.createdAt).toLocaleDateString(
                            "pt-BR",
                          )}
                        </small>
                      </td>
                      <td>
                        {company.responsible || "Não informado"}
                        <small>{company.email}</small>
                      </td>
                      <td>
                        {company.plan || "Horária"}
                        <small>{company.subscriptionStatus || "—"}</small>
                      </td>
                      <td>
                        {company.usersCount} usuários · {company.customersCount}{" "}
                        clientes
                        <small>
                          {company.ordersCount} OS ·{" "}
                          {size(company.storageBytes)}
                        </small>
                      </td>
                      <td>
                        {company.lastAccessAt
                          ? new Date(company.lastAccessAt).toLocaleString(
                              "pt-BR",
                            )
                          : "Sem registro"}
                      </td>
                      <td>
                        <span
                          className={`account-status ${company.status.toLowerCase()}`}
                        >
                          {statusLabel[company.status] || company.status}
                        </span>
                        {company.maintenance && <small>Em manutenção</small>}
                      </td>
                      <td>
                        <Link href={`/admin/empresas/${company.id}`}>
                          Abrir →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
      <section className="panel admin-settings">
        <h2>Link da Horária</h2>
        <p>
          Endereço público para compartilhar no WhatsApp, Instagram, e-mail ou
          QR Code.
        </p>
        <div className="copy-line">
          <code>{appUrl || "Defina o endereço público"}</code>
          <button
            disabled={!appUrl}
            onClick={async () => {
              await navigator.clipboard.writeText(appUrl);
              setNotice("Link da Horária copiado.");
            }}
          >
            Copiar link
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const normalizedUrl = normalizePublicUrl(String(form.get("url") || ""));
            if (!normalizedUrl) {
              setError(
                "Informe um endereço completo, começando com https:// e sem acentos no domínio.",
              );
              return;
            }
            savePlatform(
              { publicAppUrl: normalizedUrl },
              "Atualização do link público",
            );
          }}
        >
          <label>
            Endereço oficial
            <input
              name="url"
              type="url"
              defaultValue={configuredAppUrl || browserOrigin}
              placeholder="https://hor-ria-tec.vercel.app"
            />
          </label>
          <button className="primary" disabled={busy}>
            Salvar link
          </button>
        </form>
      </section>
      <section className="panel admin-settings">
        <h2>Cadastros e manutenção global</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const maintenance = form.get("maintenance") === "on";
            if (
              maintenance &&
              !window.confirm(
                "Ativar a manutenção global bloqueará todas as assistências. O SUPER_ADMIN continuará com acesso. Confirmar?",
              )
            )
              return;
            savePlatform(
              {
                registrationEnabled: form.get("registration") === "on",
                maxCompanies: Number(form.get("max")),
                globalMaintenance: maintenance,
                maintenanceMessage: String(form.get("message")),
              },
              "Configuração administrativa",
            );
          }}
        >
          <label className="check-label">
            <input
              name="registration"
              type="checkbox"
              defaultChecked={overview.registrationEnabled}
            />{" "}
            Permitir novos cadastros
          </label>
          <label>
            Limite de empresas
            <input
              name="max"
              type="number"
              min={1}
              defaultValue={overview.maxCompanies}
              required
            />
          </label>
          <label className="check-label">
            <input
              name="maintenance"
              type="checkbox"
              defaultChecked={overview.globalMaintenance}
            />{" "}
            Modo manutenção global
          </label>
          <label>
            Mensagem da manutenção
            <textarea
              name="message"
              defaultValue={overview.maintenanceMessage || ""}
              maxLength={500}
            />
          </label>
          <button className="primary" disabled={busy}>
            Salvar configurações
          </button>
        </form>
      </section>
      <section className="panel admin-settings">
        <h2>Recursos globais</h2>
        <p>Desative um módulo com problema sem interromper toda a Horária.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const flags = Object.fromEntries(
              Object.keys(featureNames).map((key) => [
                key,
                form.get(key) === "on",
              ]),
            );
            if (
              !window.confirm(
                "Aplicar estes recursos para todas as empresas? Configurações específicas continuam prevalecendo.",
              )
            )
              return;
            savePlatform(
              { featureFlags: flags },
              "Atualização dos recursos globais",
            );
          }}
        >
          <div className="feature-grid">
            {Object.entries(featureNames).map(([key, label]) => (
              <label className="check-label" key={key}>
                <input
                  name={key}
                  type="checkbox"
                  defaultChecked={Boolean(overview.featureFlags[key])}
                />{" "}
                {label}
              </label>
            ))}
          </div>
          <button className="primary" disabled={busy}>
            Salvar recursos globais
          </button>
        </form>
      </section>
    </section>
  );
}
