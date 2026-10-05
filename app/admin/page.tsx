import AdminCompaniesDashboard from "@/components/admin-companies-dashboard";
import { getServerAccess } from "@/lib/server-auth";
export default async function AdminPage() {
  const access = await getServerAccess();
  const [companies, overview, billing, expenses] = await Promise.all([
    access!.client.rpc("admin_list_companies"),
    access!.client.rpc("admin_platform_overview"),
    access!.client.rpc("admin_billing_overview"),
    access!.client.rpc("admin_list_platform_expenses", { p_limit: 50 }),
  ]);
  return (
    <AdminCompaniesDashboard
      initialCompanies={companies.data || []}
      initialOverview={overview.data}
      initialBilling={billing.data}
      initialExpenses={expenses.data || []}
    />
  );
}
