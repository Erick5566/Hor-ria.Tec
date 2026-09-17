import PublicPortal from "@/components/public-portal";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PublicPortal slug={slug} />;
}
