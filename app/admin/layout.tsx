import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import SignOutButton from "@/components/sign-out-button";
import { getServerAccess } from "@/lib/server-auth";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getServerAccess();
  if (!access) redirect("/entrar?next=/admin");
  if (!access.context.isSuperAdmin)
    redirect(access.context.company ? "/painel" : "/");
  return (
    <div className="admin-workspace">
      <aside className="admin-sidebar">
        <Brand />
        <div className="admin-identity">
          <span>ADMINISTRAÇÃO DA PLATAFORMA</span>
          <strong>Horária</strong>
          <small>{access.user.email}</small>
        </div>
        <nav aria-label="Administração Horária">
          <Link href="/admin">Empresas</Link>
          <Link href="/admin/configuracoes">Configurações</Link>
          <Link href="/admin/auditoria">Auditoria</Link>
        </nav>
        <footer>
          <SignOutButton />
        </footer>
      </aside>
      <main className="admin-main">
        <header>
          <span>
            Horária <b>/ Administração privada</b>
          </span>
          <span className="admin-role">SUPER_ADMIN</span>
        </header>
        {children}
      </main>
    </div>
  );
}
