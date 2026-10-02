import { redirect } from "next/navigation";
import { getServerAccess } from "@/lib/server-auth";

export default async function AgendaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getServerAccess();
  const company = access?.context.company;

  if (!access || !company) redirect("/entrar?next=/painel/agenda");
  if (!company.featureFlags.appointmentsEnabled) redirect("/painel");

  return children;
}
