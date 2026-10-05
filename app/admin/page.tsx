import AdminCompaniesDashboard from "@/components/admin-companies-dashboard";
import { getServerAccess } from "@/lib/server-auth";

export default async function AdminPage() {
  const access = await getServerAccess();
  const [companies, overview, billingOverview, expenses] = await Promise.all([
    access!.client.rpc("admin_list_companies"),
    access!.client.rpc("admin_platform_overview"),
    access!.client.rpc("admin_billing_overview"),
    access!.client.rpc("admin_list_platform_expenses", { p_limit: 50 }),
  ]);

  return (
    <AdminCompaniesDashboard
      initialCompanies={companies.data || []}
      initialOverview={overview.data}
      initialBillingOverview={
        billingOverview.data || {
          receivedThisMonth: 0,
          receivedTotal: 0,
          expensesThisMonth: 0,
          expensesTotal: 0,
          netThisMonth: 0,
          receivableTotal: 0,
          pendingCount: 0,
          overdueCount: 0,
          dueNext24hCount: 0,
          activeSubscriptions: 0,
          trialSubscriptions: 0,
          suspendedCount: 0,
          estimatedMrr: 0,
          graceHours: 24,
          initialAmount: 44.99,
          monthlyAmount: 59,
        }
      }
      initialExpenses={expenses.data || []}
    />
  );
}
