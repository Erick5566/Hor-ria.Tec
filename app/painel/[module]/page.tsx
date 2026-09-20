import { notFound } from "next/navigation";
import AdminModule from "@/components/admin-module";

const betaModules = [
  "servicos",
  "mesa-reparo",
  "empresa",
  "configuracoes",
  "pagina-cliente",
  "minha-pagina",
  "perfil",
  "ajuda",
] as const;

export default async function Page({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  if (!betaModules.includes(module as (typeof betaModules)[number])) notFound();
  return <AdminModule module={module} />;
}
