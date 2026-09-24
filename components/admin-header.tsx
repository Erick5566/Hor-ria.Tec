"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function pageLabel(path: string) {
  if (path === "/admin") return "Empresas";
  if (path.startsWith("/admin/configuracoes")) return "Configurações";
  if (path.startsWith("/admin/auditoria")) return "Auditoria";
  if (path.startsWith("/admin/empresas/")) return "Empresa";
  return "Administração";
}

export default function AdminHeader({
  companySlug,
}: {
  companySlug?: string | null;
}) {
  const path = usePathname();
  return (
    <header>
      <nav className="admin-breadcrumb" aria-label="Navegação estrutural">
        <span>Horária</span>
        <b aria-hidden="true">/</b>
        <span>Administração privada</span>
        <b aria-hidden="true">/</b>
        <strong>{pageLabel(path)}</strong>
      </nav>
      <div className="admin-header-actions">
        {companySlug && (
          <>
            <Link href="/painel" className="admin-header-link">
              Meu painel
            </Link>
            <Link
              href={"/" + companySlug}
              target="_blank"
              className="admin-header-link public"
            >
              Página pública ↗
            </Link>
          </>
        )}
        <span className="admin-role">Super admin</span>
      </div>
    </header>
  );
}
