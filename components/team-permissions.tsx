"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { stamp } from "@/lib/assistencia";
import { useWorkspace } from "./workspace";
import { ErrorBox, SemanticBadge, PanelTitle } from "./ui";
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
  seatLimit?: number;
  seatsUsed?: number;
  planCode?: string;
  chatbotStatus?: string;
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
  TECHNICIAN: "Central, ordens, clientes, equipamentos e mesa de reparos.",
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
    "Agenda",
    "Clientes e equipamentos",
    "Mesa de reparos",
    "Consulta de serviços",
  ],
  ATTENDANT: [
    "Recebimento e OS",
    "Agenda",
    "Clientes e equipamentos",
    "Consulta de serviços",
  ],
};

function panelPathForRole(role: TeamRole) {
  return role === "TECHNICIAN"
    ? "/painel/ordens?visao=bancada"
    : "/painel/ordens/nova";
}

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
  const [adding, setAdding] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [openInviteToken, setOpenInviteToken] = useState<string | null>(null);
  const [emailBusyToken, setEmailBusyToken] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<
    { token: string; email: string; role: TeamRole; expiresAt: string;
      emailStatus?: "nao_enviado" | "processando" | "aceito_pelo_provedor" | "falhou";
      emailLastAttemptAt?: string | null }[]
  >([]);
  const [invite, setInvite] = useState<{
    name: string;
    email: string;
    role: Exclude<TeamRole, "OWNER">;
  }>({
    name: "",
    email: "",
    role: "TECHNICIAN",
  });
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
      const pending = await supabase.rpc("list_team_invitations");
      if (pending.error) throw pending.error;
      setPendingInvites(pending.data || []);
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

  const seatLimit = data?.seatLimit ?? 3;
  const seatsUsed =
    data?.seatsUsed ??
    (data?.items || []).filter(
      (item) => item.status === "ACTIVE" && item.role !== "OWNER",
    ).length;
  const noSeatsAvailable = seatsUsed >= seatLimit;

  async function copyAccessLink(member: TeamMember) {
    if (!["TECHNICIAN", "ATTENDANT"].includes(member.role)) return;
    const url = new URL("/entrar", window.location.origin);
    url.searchParams.set("next", panelPathForRole(member.role));
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice(
        "Link do painel copiado. O funcionário precisa entrar com o e-mail convidado.",
      );
      setError("");
    } catch {
      setError(
        "Não foi possível copiar o link. Verifique a permissão do navegador.",
      );
    }
  }

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

    if (!window.confirm(`Deseja ${action} de ${member.name || member.email}?`))
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

  function invitationUrl(token: string) {
    return new URL(`/convite?token=${encodeURIComponent(token)}`, window.location.origin).toString();
  }

  async function copyInvitation(token: string) {
    try {
      await navigator.clipboard.writeText(invitationUrl(token));
      setError("");
      setNotice("Link do convite copiado. Compartilhe apenas com a pessoa convidada.");
    } catch {
      setError("Não foi possível copiar. Tente usar Compartilhar no WhatsApp.");
    }
  }

  async function sendInvitationEmail(token: string): Promise<boolean> {
    if (!supabase || emailBusyToken) return false;
    setEmailBusyToken(token);
    setError("");
    try {
      const result = await supabase.functions.invoke("send-team-invitation-email", {
        body: { token },
      });
      if (result.error || !result.data?.ok) {
        throw new Error(
          result.data?.error ||
          "O e-mail não foi aceito pelo provedor. Copie o link ou compartilhe no WhatsApp.",
        );
      }
      setNotice("E-mail do convite aceito pelo provedor. A entrega na caixa de entrada depende do destinatário.");
      await load();
      return true;
    } catch (cause) {
      setError(message(cause as Error));
      await load();
      // load() pode limpar o erro; manter o feedback visível.
      setNotice("Não foi possível confirmar o envio do e-mail. Use Copiar link ou WhatsApp.");
      return false;
    } finally {
      setEmailBusyToken(null);
    }
  }

  async function revokeInvitation(token: string) {
    if (!supabase || !window.confirm("Revogar este convite? O link deixará de funcionar.")) return;
    setInviteBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("revoke_team_invitation", { p_token: token });
      if (result.error) throw result.error;
      setOpenInviteToken(null);
      setNotice("Convite revogado. O link anterior não pode mais ser utilizado.");
      await load();
    } catch (cause) {
      setError(message(cause as Error));
    } finally {
      setInviteBusy(false);
    }
  }

  async function inviteMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setInviteBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await supabase.rpc("create_team_invitation", {
        p_name: invite.name.trim(),
        p_email: invite.email.trim().toLowerCase(),
        p_role: invite.role,
      });
      if (result.error) throw result.error;
      const token = result.data?.token as string | undefined;
      if (!token) throw new Error("Não foi possível gerar o convite.");
      setOpenInviteToken(token);
      setNotice("Convite individual criado e válido por 48 horas. Tentando enviar o e-mail…");
      setAdding(false);
      setInvite({ name: "", email: "", role: "TECHNICIAN" });
      await load();
      await sendInvitationEmail(token);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div className="team-permissions-layout">
      <ErrorBox error={error} />
      {pendingInvites.length > 0 && (
        <section className="panel" aria-label="Convites pendentes">
          <h2>Convites pendentes</h2>
          <p className="hint">Convites criados não são membros ativos até a aceitação. Abra as opções para compartilhar, reenviar ou revogar.</p>
          {pendingInvites.map((item) => {
            const open = openInviteToken === item.token;
            const url = invitationUrl(item.token);
            const shareMessage = `Você recebeu um convite para a equipe da assistência na Horária. Acesse: ${url}`;
            return (
              <div key={item.token} className="team-invite-row">
                <div className="team-list-head">
                  <div className="team-invite-identity">
                    <strong>{item.email}</strong>
                    <span>{roleLabel[item.role]} · expira {stamp(item.expiresAt)}</span>
                    <small>
                      {item.emailStatus === "aceito_pelo_provedor"
                        ? "E-mail aceito pelo provedor (entrega não confirmada)"
                        : item.emailStatus === "processando"
                          ? "Envio de e-mail em processamento"
                          : item.emailStatus === "falhou"
                            ? "Último envio por e-mail falhou"
                            : "E-mail ainda não enviado pelo sistema"}
                    </small>
                  </div>
                  <button type="button" className="outline"
                    aria-expanded={open} aria-controls={`invite-options-${item.token}`}
                    onClick={() => setOpenInviteToken(open ? null : item.token)}>
                    {open ? "Fechar opções" : "Abrir opções do convite"}
                  </button>
                </div>
                {open && (
                  <div className="team-invite-options" id={`invite-options-${item.token}`}>
                    <p>Convite individual válido por 48 horas. Apenas a conta deste e-mail pode aceitá-lo.</p>
                    <div className="team-invite-buttons">
                      <button type="button" className="outline" onClick={() => void copyInvitation(item.token)}>
                        Copiar link
                      </button>
                      <a className="outline" target="_blank" rel="noopener noreferrer"
                        href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}>
                        Compartilhar no WhatsApp
                      </a>
                      <button type="button" className="primary"
                        disabled={emailBusyToken !== null || inviteBusy}
                        onClick={() => void sendInvitationEmail(item.token)}>
                        {emailBusyToken === item.token
                          ? "Enviando e-mail…"
                          : item.emailStatus === "aceito_pelo_provedor"
                            ? "Reenviar por e-mail"
                            : "Enviar por e-mail"}
                      </button>
                      <button type="button" className="outline"
                        disabled={emailBusyToken !== null || inviteBusy}
                        onClick={() => void revokeInvitation(item.token)}>
                        {inviteBusy ? "Revogando…" : "Revogar convite"}
                      </button>
                    </div>
                    <p className="hint">O sistema não libera o acesso até o funcionário entrar com o e-mail indicado e aceitar o convite.</p>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
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

      <section className="panel" aria-label="Plano e vagas da equipe">
        <div className="team-list-head">
          <div>
            <strong>
              {data?.planCode === "HORARIA_PRO"
                ? "Horária Pro · R$ 80/mês"
                : "Horária · R$ 49/mês"}
            </strong>
            <p>
              {seatsUsed} de {seatLimit} vagas de funcionários utilizadas
              (proprietário não ocupa vaga).
            </p>
            <p>
              {data?.planCode === "HORARIA_PRO"
                ? "Chatbot incluído no planejamento do Pro; integração ainda não disponível."
                : "Precisa de mais pessoas? O plano Pro prevê até 9 funcionários por R$ 80/mês."}
            </p>
          </div>
          {noSeatsAvailable && (
            <span className="notice" role="status">
              Limite atingido. Fale com o administrador da Horária para alterar
              o plano.
            </span>
          )}
        </div>
      </section>

      <section className="panel team-role-guide">
        <div className="team-role-guide-head">
          <div>
            <span>PERFIS DE ACESSO</span>
            <PanelTitle title="Permissões por função" icon="team" />
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
            <PanelTitle title="Membros da equipe" icon="clients" />
            <p>
              Adicione funcionários, altere a função ou desative um acesso sem
              apagar o histórico.
            </p>
          </div>
          <div className="team-member-actions">
            <SemanticBadge tone="primary">
              {data?.actorRole === "OWNER"
                ? "Acesso de proprietário"
                : "Acesso de administrador"}
            </SemanticBadge>
            <button data-tour="team-add"
              type="button"
              className="primary"
              disabled={loading || noSeatsAvailable}
              onClick={() => {
                setAdding(true);
                setError("");
                setNotice("");
              }}
            >
              + Adicionar membro
            </button>
          </div>
        </div>

        {adding && (
          <div className="modal-backdrop">
            <section
              className="panel modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="team-invite-title"
            >
              <div className="panel-head">
                <div>
                  <h2 id="team-invite-title">Adicionar membro</h2>
                  <p>
                    Gere um convite individual e compartilhe com o funcionário.
                    Ele deve entrar ou criar uma conta com o e-mail indicado. A
                    conta será vinculada a esta assistência após a aceitação.
                  </p>
                </div>
                <button
                  type="button"
                  className="close"
                  aria-label="Fechar"
                  disabled={inviteBusy}
                  onClick={() => setAdding(false)}
                >
                  ×
                </button>
              </div>

              <form onSubmit={inviteMember}>
                <div className="form-grid">
                  <label>
                    Nome
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      autoComplete="name"
                      value={invite.name}
                      onChange={(event) =>
                        setInvite((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Ex.: João Silva"
                    />
                  </label>
                  <label>
                    E-mail
                    <input
                      required
                      type="email"
                      maxLength={200}
                      autoComplete="email"
                      value={invite.email}
                      onChange={(event) =>
                        setInvite((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                      placeholder="funcionario@empresa.com"
                    />
                  </label>
                  <label>
                    Função
                    <select
                      value={invite.role}
                      onChange={(event) =>
                        setInvite((current) => ({
                          ...current,
                          role: event.target.value as Exclude<
                            TeamRole,
                            "OWNER"
                          >,
                        }))
                      }
                    >
                      {data?.actorRole === "OWNER" && (
                        <option value="ADMIN">Administrador</option>
                      )}
                      <option value="TECHNICIAN">Técnico</option>
                      <option value="ATTENDANT">Atendente</option>
                    </select>
                  </label>
                </div>

                <div className="form-actions">
                  <button
                    type="button"
                    className="outline"
                    disabled={inviteBusy}
                    onClick={() => setAdding(false)}
                  >
                    Cancelar
                  </button>
                  <button className="primary" disabled={inviteBusy}>
                    {inviteBusy ? "Criando convite…" : "Criar convite e enviar e-mail"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

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
                    {member.status === "ACTIVE" &&
                      ["TECHNICIAN", "ATTENDANT"].includes(member.role) && (
                        <button
                          type="button"
                          className="outline"
                          onClick={() => void copyAccessLink(member)}
                          title="Link de acesso para funcionário já vinculado"
                        >
                          Copiar link do painel
                        </button>
                      )}
                    <button
                      type="button"
                      className="primary"
                      disabled={
                        !changed || locked || busyUser === member.userId
                      }
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
              Clique em <b>Adicionar membro</b> para convidar um técnico,
              atendente ou administrador para esta assistência.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
