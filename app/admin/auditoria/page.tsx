import AdminAudit from "@/components/admin-audit";
import { getServerAccess } from "@/lib/server-auth";
export default async function AuditPage() {
  const access = await getServerAccess();
  const result = await access!.client.rpc("admin_audit_recent", {
    p_limit: 100,
  });
  return <AdminAudit entries={result.data || []} />;
}
