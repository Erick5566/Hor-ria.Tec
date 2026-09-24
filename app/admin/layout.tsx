import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import SignOutButton from "@/components/sign-out-button";
import AdminHeader from "@/components/admin-header";
import SessionKeeper from "@/components/session-keeper";
import { getServerAccess } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Administração",
  description: "Administração interna da plataforma Horária.",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getServerAccess();
  if (!access) redirect("/entrar?next=/admin");
  if (!access.context.isSuperAdmin)
    redirect(access.context.company ? "/painel" : "/");
  if (access.aal !== "aal2")
    redirect("/seguranca/mfa?next=/admin");
  return (
    <div className="admin-workspace">
      <SessionKeeper />
      <aside className="admin-sidebar">
        <Brand />
        <div className="admin-identity">
          <span>ADMINISTRAÇÃO DA PLATAFORMA</span>
          <strong>Horária</strong>
          <small>{access.user.email}</small>
        </div>
        <nav aria-label="Administração Horária">
          <Link href="/admin">
            <span aria-hidden="true">▦</span>
            Empresas
          </Link>
          <Link href="/admin/configuracoes">
            <span aria-hidden="true">⚙</span>
            Configurações
          </Link>
          <Link href="/admin/auditoria">
            <span aria-hidden="true">◫</span>
            Auditoria
          </Link>
        </nav>
        {access.context.company && (
          <div className="admin-quick-links">
            <Link href="/painel">Abrir meu painel</Link>
            <Link href={`/${access.context.company.slug}`} target="_blank">
              Ver página pública ↗
            </Link>
          </div>
        )}
        <footer>
          <SignOutButton />
        </footer>
      </aside>
      <main className="admin-main">
        <AdminHeader companySlug={access.context.company?.slug} />
        {children}
      </main>
    </div>
  );
}
