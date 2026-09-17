import RecordDetail from "@/components/record-detail";
export default async function Client({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <RecordDetail id={(await params).id} kind="clientes" />;
}
