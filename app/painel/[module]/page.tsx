import { notFound, redirect } from "next/navigation";
import AdminModule from "@/components/admin-module";
import { getServerAccess } from "@/lib/server-auth";

const managerOnlyModules = new Set([
  "financeiro",
  "relatorios",
  "notas-fiscais",
  "vendas",
  "seminovos",
  "vitrine",
  "pos-venda",
  "empresa",
  "configuracoes",
  "equipe",
  "minha-pagina",
]);

const betaModules = [
  "servicos",
  "mesa-reparo",
  "financeiro",
  "notas-fiscais",
  "vendas",
  "seminovos",
  "vitrine",
  "pos-venda",
  "estoque",
  "relatorios",
  "empresa",
  "configuracoes",
  "equipe",
  "pagina-cliente",
  "minha-pagina",
  "perfil",
  "ajuda",
] as const;

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ visao?: string; q?: string; ordem?: string }>;
}) {
  const { module } = await params;
  if (!betaModules.includes(module as (typeof betaModules)[number])) notFound();

  const stockOperationalModules = new Set(["estoque"]);

  if (
    managerOnlyModules.has(module) ||
    stockOperationalModules.has(module)
  ) {
    const access = await getServerAccess();
    const company = access?.context.company;
    const role = company?.role || "";

    if (!company) redirect("/painel");
    if (managerOnlyModules.has(module) && !["OWNER", "ADMIN"].includes(role))
      redirect("/painel");

    if (
      stockOperationalModules.has(module) &&
      (!company.featureFlags.stockEnabled || role === "ATTENDANT")
    )
      redirect("/painel");

    if (
      ["financeiro", "relatorios"].includes(module) &&
      !company.featureFlags.financialEnabled
    )
      redirect("/painel");
  }

  const query = await searchParams;
  if (module === "mesa-reparo")
    redirect(
      `/painel/ordens?visao=bancada${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`,
    );
  if (module === "relatorios") redirect("/painel/financeiro?visao=relatorios");
  if (module === "pagina-cliente") redirect("/painel/minha-pagina");
  return (
    <AdminModule
      module={module}
      view={query.visao}
      orderId={query.ordem}
    />
  );
}
