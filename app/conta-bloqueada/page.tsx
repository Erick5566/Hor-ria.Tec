import { redirect } from "next/navigation";
import BlockedSubscription from "@/components/blocked-subscription";
import { getServerAccess } from "@/lib/server-auth";

export default async function BlockedPage() {
  const access = await getServerAccess();
  if (!access) redirect("/entrar?next=/conta-bloqueada");

  if (access.context.isSuperAdmin && !access.context.company) {
    redirect("/admin");
  }

  const company = access.context.company;
  if (!company) redirect("/");

  if (!["SUSPENDED", "CANCELED", "PENDING_DELETION"].includes(company.status)) {
    redirect("/painel");
  }

  return <BlockedSubscription initialAccess={access.context} />;
}
