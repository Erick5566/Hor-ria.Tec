import Dashboard from "@/components/dashboard-page";
import { requirePanelFeature } from "@/lib/require-panel-feature";
export default async function Page() {
  await requirePanelFeature("dashboardEnabled");
  return <Dashboard />;
}
