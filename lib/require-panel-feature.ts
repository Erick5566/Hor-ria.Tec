import "server-only";
import { redirect } from "next/navigation";
import { getServerAccess } from "./server-auth";
import { featureEnabled, type PlatformFeatureKey } from "./platform-features";

export async function requirePanelFeature(feature: PlatformFeatureKey) {
  const access = await getServerAccess();
  if (!access) redirect("/entrar?next=/painel");
  if (
    access.context.company &&
    !featureEnabled(access.context.company.featureFlags, feature)
  ) {
    redirect("/painel/indisponivel");
  }
  return access;
}
