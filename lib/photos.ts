import { supabase, publicDb } from "./supabase";
export type PendingPhoto = {
  id: string;
  file: File;
  preview: string;
  categoria: string;
  descricao: string;
  angulo?: string;
  caminho?: string;
  uploaded?: boolean;
  saved?: boolean;
};
const PHOTO_DRAFT_DB = "horaria-order-drafts";
const PHOTO_DRAFT_STORE = "photos";
const PHOTO_DRAFT_VERSION = 1;

function openPhotoDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DRAFT_DB, PHOTO_DRAFT_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_DRAFT_STORE)) {
        db.createObjectStore(PHOTO_DRAFT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("Não foi possível abrir o rascunho de fotos."));
  });
}

export async function savePendingPhotosDraft(
  key: string,
  photos: PendingPhoto[],
) {
  if (typeof indexedDB === "undefined") return;
  const db = await openPhotoDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PHOTO_DRAFT_STORE, "readwrite");
      const store = transaction.objectStore(PHOTO_DRAFT_STORE);
      store.put({
        key,
        photos: photos.map(({ preview: _preview, ...photo }) => photo),
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ||
            new Error("Não foi possível salvar o rascunho de fotos."),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ||
            new Error("Não foi possível salvar o rascunho de fotos."),
        );
    });
  } finally {
    db.close();
  }
}

export async function loadPendingPhotosDraft(
  key: string,
): Promise<PendingPhoto[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openPhotoDraftDb();
  try {
    const record = await new Promise<
      { key: string; photos?: Omit<PendingPhoto, "preview">[] } | undefined
    >((resolve, reject) => {
      const transaction = db.transaction(PHOTO_DRAFT_STORE, "readonly");
      const request = transaction.objectStore(PHOTO_DRAFT_STORE).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error ||
            new Error("Não foi possível restaurar o rascunho de fotos."),
        );
    });
    return (record?.photos || []).map((photo) => ({
      ...photo,
      preview: URL.createObjectURL(photo.file),
    }));
  } finally {
    db.close();
  }
}

export async function clearPendingPhotosDraft(key: string) {
  if (typeof indexedDB === "undefined") return;
  const db = await openPhotoDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PHOTO_DRAFT_STORE, "readwrite");
      transaction.objectStore(PHOTO_DRAFT_STORE).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ||
            new Error("Não foi possível limpar o rascunho de fotos."),
        );
    });
  } finally {
    db.close();
  }
}

export async function preparePhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Use fotos JPEG, PNG ou WebP. Converta imagens HEIC antes do envio.",
    );
  if (file.size > 25 * 1024 * 1024)
    throw new Error(
      "Cada imagem deve ter no máximo 25 MB antes da otimização.",
    );
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar a imagem");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("Falha ao converter imagem")),
        "image/jpeg",
        0.86,
      ),
    );
    if (blob.size > 6 * 1024 * 1024)
      throw new Error("A imagem excede 6 MB. Escolha uma foto menor.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } finally {
    bitmap.close();
  }
}
export async function uploadPhotos(
  empresaId: string,
  ordemId: string,
  photos: PendingPhoto[],
  token?: string,
) {
  const db = token ? publicDb! : supabase!;
  for (const p of photos) {
    if (p.saved) continue;
    p.caminho ||= `${empresaId}/${ordemId}/${token || "equipe"}/${p.id}.jpg`;
    if (!p.uploaded) {
      const { error } = await db.storage
        .from("os-fotos")
        .upload(p.caminho, p.file, {
          contentType: "image/jpeg",
          upsert: false,
        });
      if (error)
        throw new Error(
          `Não foi possível enviar ${p.file.name}: ${error.message}`,
        );
      p.uploaded = true;
    }
    const { error } = await db.rpc("registrar_foto", {
      p_caminho: p.caminho,
      p_categoria: p.categoria,
      p_descricao: p.angulo
        ? `Ângulo: ${p.angulo}${p.descricao ? ` · ${p.descricao}` : ""}`
        : p.descricao || null,
    });
    if (error) throw error;
    p.saved = true;
  }
}
