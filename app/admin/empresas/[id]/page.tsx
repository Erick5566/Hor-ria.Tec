import { notFound } from "next/navigation";
import AdminCompany from "@/components/admin-company";
import { getServerAccess } from "@/lib/server-auth";
export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await getServerAccess();
  const result = await access!.client.rpc("admin_company_detail", {
    p_empresa: id,
  });
  if (!result.data) notFound();
  return <AdminCompany company={result.data} />;
}
