import { supabase } from "./supabase";

export function validateReplacementFile(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error("Escolha uma imagem JPEG, PNG ou WebP.");
  if (!file.size || file.size > 6 * 1024 * 1024)
    throw new Error("A imagem deve ter no máximo 6 MB.");
}

export async function correctSavedPhoto(
  orderId: string,
  photoId: string,
  file?: File,
  db = supabase!,
) {
  if (file) validateReplacementFile(file);
  const hash = file
    ? Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
        ),
      )
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("")
    : null;
  const args = {
    p_ordem: orderId,
    p_foto: photoId,
    p_action: file ? "replace" : "remove",
    p_content_hash: hash,
  };
  let prepared = await db.rpc("prepare_os_photo_correction", args);
  if (prepared.error) throw prepared.error;
  let op = prepared.data as {
    id: string;
    path: string;
    uploaded: boolean;
    action?: string;
    contentHash?: string;
  };
  if (op.action && (op.action !== args.p_action || op.contentHash !== hash)) {
    const cancelled = await db.rpc("cancel_os_photo_correction", {
      p_operation: op.id,
    });
    if (cancelled.error) throw cancelled.error;
    if (cancelled.data?.status !== "cancelled")
      throw new Error(
        "A correção anterior já foi aplicada. Recarregue a galeria antes de alterar novamente.",
      );
    prepared = await db.rpc("prepare_os_photo_correction", args);
    if (prepared.error) throw prepared.error;
    op = prepared.data;
  }
  try {
    if (file && !op.uploaded) {
      const uploaded = await db.storage.from("os-fotos").upload(op.path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploaded.error) throw uploaded.error;
    }
    const applied = await db.rpc("apply_os_photo_correction", {
      p_operation: op.id,
    });
    if (applied.error) throw applied.error;
  } catch (error) {
    // Cancelling reconciles a lost commit response. It never undoes an applied
    // correction; an unused upload is queued for guarded server-side cleanup.
    const reconciled = await Promise.resolve(
      db.rpc("cancel_os_photo_correction", { p_operation: op.id }),
    ).catch(() => null);
    if (reconciled?.data?.status === "applied") return;
    throw error;
  }
}

export async function cleanupSavedPhotos(orderId: string) {
  const response = await fetch("/api/photos/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId }),
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.pending === 0;
}
