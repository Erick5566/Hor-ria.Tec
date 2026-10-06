import { NextResponse } from "next/server";
import { getServerAccess } from "@/lib/server-auth";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });
  const access = await getServerAccess();
  if (!access)
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (
    typeof body?.orderId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.orderId)
  )
    return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
  const queue = await access.client.rpc("pending_os_photo_cleanup", {
    p_ordem: body.orderId,
  });
  if (queue.error)
    return NextResponse.json(
      { error: "Limpeza não autorizada." },
      { status: 403 },
    );
  let pending = 0;
  for (const item of (queue.data || []) as { id: string; path: string }[]) {
    // Paths come exclusively from the guarded queue, never from request data.
    const removed = await access.client.storage
      .from("os-fotos")
      .remove([item.path]);
    if (removed.error) {
      pending++;
      continue;
    }
    const completed = await access.client.rpc("complete_os_photo_cleanup", {
      p_operation: item.id,
    });
    if (completed.error) pending++;
  }
  const remaining = await access.client.rpc("pending_os_photo_cleanup", {
    p_ordem: body.orderId,
  });
  if (remaining.error) pending++;
  else pending = Math.max(pending, (remaining.data || []).length);
  return NextResponse.json(
    { pending },
    { headers: { "Cache-Control": "no-store" } },
  );
}
