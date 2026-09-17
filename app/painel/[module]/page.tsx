import { notFound } from "next/navigation";
import AdminModule from "@/components/admin-module";
export default async function Page({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  if (
    ![
      "servicos",
      "mesa-reparo",
      "vendas",
      "seminovos",
      "vitrine",
      "pos-venda",
      "estoque",
      "financeiro",
      "relatorios",
      "empresa",
      "configuracoes",
      "pagina-cliente",
      "minha-pagina",
      "perfil",
      "ajuda",
    ].includes(module)
  )
    notFound();
  return <AdminModule module={module} />;
}
