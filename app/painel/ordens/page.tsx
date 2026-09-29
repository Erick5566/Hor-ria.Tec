import { Suspense } from "react";
import OrdersWorkspace from "@/components/orders-workspace";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string; q?: string }>;
}) {
  const { visao, q } = await searchParams;
  const view = visao === "lista" || (!visao && q) ? "lista" : "bancada";
  return (
    <Suspense fallback={<p role="status">Carregando ordens…</p>}>
      <OrdersWorkspace view={view} query={q} />
    </Suspense>
  );
}
