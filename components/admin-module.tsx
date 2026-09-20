"use client";
import { useState } from "react";
import Link from "next/link";
import { Heading, ErrorBox } from "./ui";
import CatalogManagement from "./catalog-management";
import CompanySettings from "./company-settings";
import Finance from "./finance";
import RepairBench from "./repair-bench";
import PublicPageSettings from "./public-page-settings";
import InventoryManagement from "./inventory-management";
import Reports from "./reports";
import { useWorkspace } from "./workspace";
import { supabase, message } from "@/lib/supabase";
const titles: Record<string, string> = {
  servicos: "Serviços",
  "mesa-reparo": "Mesa de reparo",
  financeiro: "Financeiro",
  estoque: "Estoque",
  relatorios: "Relatórios",
  empresa: "Minha empresa",
  configuracoes: "Configurações",
  "pagina-cliente": "Página do cliente",
  "minha-pagina": "Minha página",
  perfil: "Perfil",
  ajuda: "Ajuda",
};
export default function AdminModule({ module }: { module: string }) {
  const { empresa, email } = useWorkspace(),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className={`module module-${module}`}>
      <Heading title={titles[module]} />
      {module === "servicos" && <CatalogManagement />}
      {module === "mesa-reparo" && <RepairBench />}
      {module === "financeiro" && <Finance />}
      {module === "estoque" && <InventoryManagement />}
      {module === "relatorios" && <Reports />}
      {module === "minha-pagina" && <PublicPageSettings />}
      {["empresa", "configuracoes"].includes(module) && <CompanySettings />}
      {module === "pagina-cliente" && (
        <section className="panel">
          <h2>Receba solicitações pela sua página</h2>
          <p>
            Seu cliente poderá cadastrar o equipamento, informar o problema,
            enviar fotos e escolher um horário.
          </p>
          <p>Endereço: /{empresa.slug}</p>
          <div className="inline-actions">
            <Link className="primary" href={`/${empresa.slug}`} target="_blank">
              Abrir página ↗
            </Link>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${location.origin}/${empresa.slug}`,
                  );
                  setNotice("Link copiado.");
                } catch {
                  setError("Não foi possível copiar. Use o endereço exibido.");
                }
              }}
            >
              Copiar link
            </button>
            <Link className="outline" href="/painel/empresa">
              Editar apresentação
            </Link>
          </div>
          <p role="status">{notice}</p>
          <ErrorBox error={error} />
          <h3>Agendamento direto</h3>
          <Link href={`/agendar/${empresa.slug}`}>
            Abrir agenda pública existente →
          </Link>
        </section>
      )}
      {module === "perfil" && (
        <section className="panel">
          <h2>Sua conta</h2>
          <p>{email}</p>
          <ErrorBox error={error} />
          <p role="status">{notice}</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              const r = await supabase!.auth.updateUser({
                password: String(f.get("senha")),
              });
              setBusy(false);
              if (r.error) setError(message(r.error));
              else {
                setNotice("Senha atualizada.");
                (e.target as HTMLFormElement).reset();
              }
            }}
          >
            <label>
              Nova senha
              <input
                name="senha"
                type="password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>
            <button disabled={busy} className="primary">
              Atualizar senha
            </button>
          </form>
        </section>
      )}
      {module === "ajuda" && (
        <section className="panel">
          <h2>Do recebimento à entrega</h2>
          <ol>
            <li>
              Abra uma nova ordem, selecione o cliente e registre o equipamento.
            </li>
            <li>Fotografe o estado de entrada e marque o checklist.</li>
            <li>Registre o diagnóstico e crie o orçamento.</li>
            <li>
              Disponibilize o orçamento e compartilhe o código de
              acompanhamento.
            </li>
            <li>Após a aprovação, registre o reparo e os testes.</li>
            <li>Marque como pronto para retirada e finalize na entrega.</li>
          </ol>
          <h3>Fotos e privacidade</h3>
          <p>
            As fotos ficam em armazenamento privado e mantêm seu histórico. A
            consulta pública mostra somente o andamento e o orçamento; senha do
            aparelho e diagnóstico interno não são exibidos.
          </p>
          <h3>Agenda</h3>
          <p>
            Vincule recebimentos e retiradas à ordem na agenda para manter a
            operação organizada e evitar retrabalho.
          </p>
          <Link className="primary" href="/painel/ordens/nova">
            Criar uma ordem
          </Link>
        </section>
      )}
    </section>
  );
}
