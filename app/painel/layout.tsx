import type { Metadata } from "next";
import Workspace from "@/components/workspace";
import { redirect } from "next/navigation";
import { getServerAccess } from "@/lib/server-auth";
export const metadata: Metadata = {
  title: "Painel",
  description: "Área interna de gestão da assistência técnica.",
  robots: { index: false, follow: false },
};

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getServerAccess();
  if (!access) redirect("/entrar?next=/painel");
  if (access.context.isSuperAdmin && access.aal !== "aal2")
    redirect("/seguranca/mfa?next=/painel");
  if (access.context.isSuperAdmin && !access.context.company)
    redirect("/admin");
  if (access.context.globalMaintenance)
    redirect(access.context.isSuperAdmin ? "/admin" : "/manutencao");
  const company = access.context.company;
  if (company?.maintenance)
    redirect(access.context.isSuperAdmin ? "/admin" : "/manutencao");
  if (
    company &&
    ["SUSPENDED", "CANCELED", "PENDING_DELETION"].includes(company.status)
  )
    redirect(`/conta-bloqueada?status=${company.status}`);

  let initialEmpresa = null;
  if (company) {
    const companyResult = await access.client
      .from("empresas")
      .select("*")
      .eq("id", company.id)
      .maybeSingle();
    if (companyResult.error) throw companyResult.error;
    initialEmpresa = companyResult.data;
  }

  return (
    <Workspace
      initialAccess={access.context}
      initialEmpresa={initialEmpresa}
      initialUserId={access.user.id}
      initialEmail={access.user.email || ""}
    >
      {children}
    </Workspace>
  );
}
