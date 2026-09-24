"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspace } from "./workspace";
import { ErrorBox, SemanticBadge } from "./ui";
import { message, supabase } from "@/lib/supabase";

type TeamRole = "OWNER" | "ADMIN" | "TECHNICIAN" | "ATTENDANT";
type TeamStatus = "ACTIVE" | "INACTIVE";

type TeamMember = {
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
  status: TeamStatus;
  lastAccessAt?: string | null;
  createdAt: string;
  isCurrentUser: boolean;
};

type TeamData = {
  actorRole: "OWNER" | "ADMIN";
  items: TeamMember[];
};

const roleLabel: Record<TeamRole, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  TECHNICIAN: "Técnico",
  ATTENDANT: "Atendente",
};

const roleSummary: Record<TeamRole, string> = {
  OWNER: "Controle total da conta, equipe, financeiro e configurações.",
  ADMIN: "Gestão da operação, financeiro, relatórios e equipe operacional.",
  TECHNICIAN: "Central, ordens, clientes, equipamentos e estoque operacional.",
  ATTENDANT: "Recebimento, agenda, ordens, clientes e equipamentos.",
};

const rolePermissions: Record<TeamRole, string[]> = {
  OWNER: [
    "Atendimento e OS",
    "Agenda",
    "Clientes e equipamentos",
    "Estoque",
    "Financeiro e relatórios",
    "Serviços",
    "Equipe",
    "Configurações da empresa",
  ],
  ADMIN: [
    "Atendimento e OS",
    "Agenda",
    "Clientes e equipamentos",
    "Estoque",
    "Financeiro e relatórios",
    "Serviços",
    "Equipe operacional",
    "Configurações da empresa",
  ],
  TECHNICIAN: [
    "Central e OS",
    "Clientes e equipamentos",
    "Estoque operacional",
    "Consulta de serviços",
  ],
  ATTENDANT: [
    "Recebimento e OS",
    "Agenda",
    "Clientes e equipamentos",
    "Consulta de serviços",
  ],
};

function relativeAccess(value?: string | null) {
  if (!value) return "Sem acesso registrado";
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "Acessou hoje";
  if (days === 1) return "Acessou ontem";
  return `Último acesso há ${days} dias`;
}

export default function TeamPermissions() {
  const { access } = useWorkspace();
  const canManage = ["OWNER", "ADMIN"].includes(access.company?.role || "");
  const [data, setData] = useState<TeamData | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { role: TeamRole; status: TeamStatus }>
  >({});
  const [loading, setLoading] = useState(true);
  const [busyUser, setBusyUser] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase || !canManage) return;
    setLoading(true);
    setError("");
    try {
      const result = await supabase.rpc("team_members_data");
      if (result.error) throw result.error;
      const next = result.data as TeamData;
      setData(next);
      setDrafts(
        Object.fromEntries(
          next.items.map((item) => [
            item.userId,
            { role: item.role, status: item.status },
          ]),
        ),
      );
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const items = data?.items || [];
    return {
      total: items.length,
      active: items.filter((item) => item.status === "ACTIVE").length,
      technicians: items.filter((item) => item.role === "TECHNICIAN").length,
      attendants: items.filter((item) => item.role === "ATTENDANT").length,
    };
  }, [data]);

  if (!canManage) {
    return (
      <section className="panel">
        <h2>Equipe e permissões</h2>
        <p>
          Somente proprietários e administradores podem consultar esta área.
        </p>
      </section>
    );
  }

  async function saveMember(member: TeamMember) {
    const draft = drafts[member.userId];
    if (!draft || !supabase) return;

    const roleChanged = draft.role !== member.role;
    const statusChanged = draft.status !== member.status;
    if (!roleChanged && !statusChanged) return;

    const action =
      draft.status === "INACTIVE"
        ? "desativar o acesso"
        : roleChanged
          ? "alterar a função"
          : "reativar o acesso";

    if (
      !window.confirm(
        `Deseja ${action} de ${member.name || member.email}?`,
      )
    )
      return;

    setBusyUser(member.userId);
    setError("");
    setNotice("");
    try {
      const result = await supabase.rpc("update_team_member_access", {
        p_user: member.userId,
        p_role: draft.role,
        p_status: draft.status,
      });
      if (result.error) throw result.error;
      setNotice("Permissões da equipe atualizadas.");
      await load();
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusyUser("");
    }
  }

  return (
    <div className="team-permissions-layout">
      <ErrorBox error={error} />
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <section className="team-permission-summary">
        <article>
          <span>Equipe</span>
          <strong>{counts.total}</strong>
          <small>Membros vinculados</small>
        </article>
        <article>
          <span>Ativos</span>
          <strong>{counts.active}</strong>
          <small>Com acesso ao sistema</small>
        </article>
        <article>
          <span>Técnicos</span>
          <strong>{counts.technicians}</strong>
          <small>Operação técnica</small>
        </article>
        <article>
          <span>Atendentes</span>
          <strong>{counts.attendants}</strong>
          <small>Atendimento e recepção</small>
        </article>
      </section>

      <section className="panel team-role-guide">
        <div className="team-role-guide-head">
          <div>
            <span>PERFIS DE ACESSO</span>
            <h2>Permissões por função</h2>
            <p>
              Cada funcionário recebe um perfil claro. As áreas administrativas
              continuam protegidas pelas regras do banco, não apenas pelo menu.
            </p>
          </div>
        </div>
        <div className="team-role-grid">
          {(["ADMIN", "TECHNICIAN", "ATTENDANT"] as TeamRole[]).map((role) => (
            <article key={role}>
              <strong>{roleLabel[role]}</strong>
              <p>{roleSummary[role]}</p>
              <div>
                {rolePermissions[role].map((permission) => (
                  <span key={permission}>✓ {permission}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="team-list-head">
          <div>
            <h2>Membros da equipe</h2>
            <p>
              Altere a função ou desative um acesso sem apagar o histórico do
              funcionário.
            </p>
          </div>
          <SemanticBadge tone="primary">
            {data?.actorRole === "OWNER" ? "Acesso de proprietário" : "Acesso de administrador"}
          </SemanticBadge>
        </div>

        {loading ? (
          <div className="module-inline-loading" aria-live="polite">
            <span />
            <div>
              <strong>Carregando equipe…</strong>
              <small>Consultando os acessos vinculados à assistência.</small>
            </div>
          </div>
        ) : (
          <div className="team-member-list">
            {(data?.items || []).map((member) => {
              const draft = drafts[member.userId] || {
                role: member.role,
                status: member.status,
              };
              const isOwner = member.role === "OWNER";
              const adminLocked =
                data?.actorRole === "ADMIN" && member.role === "ADMIN";
              const locked = isOwner || member.isCurrentUser || adminLocked;
              const changed =
                draft.role !== member.role || draft.status !== member.status;

              return (
                <article
                  key={member.userId}
                  className={
                    "team-member-card " +
                    (member.status === "INACTIVE" ? "is-inactive" : "")
                  }
                >
                  <div className="team-member-avatar" aria-hidden="true">
                    {(member.name || member.email || "?")
                      .slice(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="team-member-identity">
                    <div>
                      <strong>{member.name || "Nome não informado"}</strong>
                      {member.isCurrentUser && <span>Você</span>}
                    </div>
                    <small>{member.email || "E-mail não informado"}</small>
                    <small>{relativeAccess(member.lastAccessAt)}</small>
                  </div>

                  <label>
                    Função
                    <select
                      value={draft.role}
                      disabled={locked}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [member.userId]: {
                            ...draft,
                            role: event.target.value as TeamRole,
                          },
                        }))
                      }
                    >
                      {isOwner && <option value="OWNER">Proprietário</option>}
                      <option
                        value="ADMIN"
                        disabled={data?.actorRole !== "OWNER"}
                      >
                        Administrador
                      </option>
                      <option value="TECHNICIAN">Técnico</option>
                      <option value="ATTENDANT">Atendente</option>
                    </select>
                  </label>

                  <label>
                    Acesso
                    <select
                      value={draft.status}
                      disabled={locked}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [member.userId]: {
                            ...draft,
                            status: event.target.value as TeamStatus,
                          },
                        }))
                      }
                    >
                      <option value="ACTIVE">Ativo</option>
                      <option value="INACTIVE">Desativado</option>
                    </select>
                  </label>

                  <div className="team-member-actions">
                    <SemanticBadge
                      tone={member.status === "ACTIVE" ? "success" : "neutral"}
                    >
                      {member.status === "ACTIVE" ? "Ativo" : "Desativado"}
                    </SemanticBadge>
                    <button
                      type="button"
                      className="primary"
                      disabled={!changed || locked || busyUser === member.userId}
                      onClick={() => void saveMember(member)}
                    >
                      {busyUser === member.userId ? "Salvando…" : "Salvar"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && (data?.items.length || 0) <= 1 && (
          <div className="team-empty-note">
            <strong>Ainda não há funcionários vinculados.</strong>
            <p>
              Quando um técnico ou atendente for vinculado à assistência, ele
              aparecerá aqui para você definir a função e ativar ou desativar o
              acesso.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
