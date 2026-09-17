import AdminDashboard from "@/components/admin-dashboard";
import { getServerAccess } from "@/lib/server-auth";
export default async function AdminPage() {
  const access = await getServerAccess();
  const [companies, overview] = await Promise.all([
    access!.client.rpc("admin_list_companies"),
    access!.client.rpc("admin_platform_overview"),
  ]);
  return (
    <AdminDashboard
      initialCompanies={companies.data || []}
      initialOverview={overview.data}
    />
  );
}
