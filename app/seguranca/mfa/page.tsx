import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SuperAdminMfa from "@/components/super-admin-mfa";
import { getServerAccess } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Verificação de segurança",
  description: "Verificação em duas etapas da administração Horária.",
  robots: { index: false, follow: false },
};

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const access = await getServerAccess();
  if (!access) redirect("/entrar?next=/seguranca/mfa");
  if (!access.context.isSuperAdmin)
    redirect(access.context.company ? "/painel" : "/");

  const params = await searchParams;
  const requested =
    params.next?.startsWith("/admin") || params.next?.startsWith("/painel")
      ? params.next
      : "/admin";

  if (access.aal === "aal2") redirect(requested);

  return (
    <SuperAdminMfa next={requested} email={access.user.email || ""} />
  );
}
