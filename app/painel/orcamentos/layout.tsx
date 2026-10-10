import { requirePanelFeature } from "@/lib/require-panel-feature";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePanelFeature("quotesEnabled");
  return children;
}
