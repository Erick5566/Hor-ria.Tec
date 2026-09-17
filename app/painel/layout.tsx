import Workspace from "@/components/workspace";
import { redirect } from "next/navigation";
import { getServerAccess } from "@/lib/server-auth";
export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getServerAccess();
  if (!access) redirect("/entrar?next=/painel");
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
  return <Workspace initialAccess={access.context}>{children}</Workspace>;
}
