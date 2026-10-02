import { redirect } from "next/navigation";
import HomeLanding from "@/components/home-landing";
import SessionBridge from "@/components/session-bridge";
import { getServerAccess } from "@/lib/server-auth";

export default async function Home() {
  const access = await getServerAccess();
  if (access) redirect(access.context.isSuperAdmin ? "/admin" : "/painel");

  return (
    <>
      <SessionBridge />
      <HomeLanding />
    </>
  );
}
