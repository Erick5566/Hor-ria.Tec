import { notFound, redirect } from "next/navigation";
import AdminModule from "@/components/admin-module";

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
  searchParams: Promise<{ visao?: string; q?: string }>;
}) {
  const { module } = await params;
  if (!betaModules.includes(module as (typeof betaModules)[number])) notFound();
  const query = await searchParams;
  if (module === "mesa-reparo")
    redirect(
      `/painel/ordens?visao=bancada${query.q ? `&q=${encodeURIComponent(query.q)}` : ""}`,
    );
  if (module === "relatorios") redirect("/painel/financeiro?visao=relatorios");
  if (module === "pagina-cliente") redirect("/painel/minha-pagina");
  return <AdminModule module={module} view={query.visao} />;
}
