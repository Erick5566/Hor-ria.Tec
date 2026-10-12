import { redirect } from "next/navigation";
import AdminAiOperations, { type AdminAiOverviewData } from "@/components/admin-ai-operations";
import { getServerAccess } from "@/lib/server-auth";
import "./ai-operations.css";

export const dynamic = "force-dynamic";
export const metadata = { title:"Horária IA · Administração", robots:{ index:false, follow:false } };

export default async function AdminAiPage(){
  const access=await getServerAccess();
  if(!access) redirect("/entrar?next=/admin/ia");
  if(!access.context.isSuperAdmin) redirect(access.context.company?"/painel":"/");
  if(access.aal!=="aal2") redirect("/seguranca/mfa?next=/admin/ia");
  const result=await access.client.rpc("admin_ai_overview");
  if(result.error || !result.data)
    throw new Error("Não foi possível consultar o painel de créditos da IA. Verifique se a migração foi aplicada.");
  return <AdminAiOperations data={result.data as AdminAiOverviewData}/>;
}
