"use client";
import { useEffect, useRef, useState } from "react";
import InlineCamera from "./inline-camera";
import { preparePhoto } from "@/lib/photos";
import {
  cleanupSavedPhotos,
  correctSavedPhoto,
  validateReplacementFile,
} from "@/lib/photo-corrections";
import { message } from "@/lib/supabase";
import { ErrorBox } from "./ui";

export default function SavedPhotoActions({
  orderId,
  photoId,
  description,
  onChanged,
  onCleanupPending,
}: {
  orderId: string;
  photoId: string;
  description: string;
  onChanged: () => Promise<void>;
  onCleanupPending: () => void;
}) {
  const [open, setOpen] = useState(false),
    [camera, setCamera] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null),
    lock = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  async function choose(chosen: File) {
    setError("");
    setBusy(true);
    try {
      validateReplacementFile(chosen);
      const prepared = await preparePhoto(chosen);
      setFile(prepared);
      setPreview(URL.createObjectURL(prepared));
      setCamera(false);
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }
  async function change(remove: boolean) {
    if (lock.current || busy || (!remove && !file)) return;
    if (
      remove &&
      !window.confirm(
        "Remover esta foto da OS? A ação altera o registro fotográfico da ordem e será registrada no histórico.",
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await correctSavedPhoto(orderId, photoId, remove ? undefined : file!);
      setOpen(false);
      setFile(null);
      setPreview("");
      await onChanged();
      const cleaned = await cleanupSavedPhotos(orderId).catch(() => false);
      if (!cleaned) onCleanupPending();
    } catch (caught) {
      setError(
        message(caught as Error) +
          " Recarregue a galeria para reconciliar uma resposta perdida; a limpeza permanece recuperável.",
      );
      await onChanged();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <div className="saved-photo-actions">
        <button
          ref={opener}
          type="button"
          disabled={busy}
          onClick={() => {
            setOpen(true);
            setError("");
          }}
        >
          Substituir foto
        </button>
        <button type="button" disabled={busy} onClick={() => void change(true)}>
          Remover foto
        </button>
      </div>
      <ErrorBox error={error} />
      {open && (
        <div
          className="modal-backdrop saved-photo-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Substituir foto salva"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !busy) {
              setOpen(false);
              setFile(null);
              setPreview("");
              opener.current?.focus();
            }
            if (event.key === "Tab") {
              const buttons = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              );
              const first = buttons[0],
                last = buttons[buttons.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <section className="modal saved-photo-modal">
            <h2>Substituir foto</h2>
            <p>{description}</p>
            <p>
              O ângulo e a categoria serão preservados. A alteração ficará
              registrada no histórico.
            </p>
            {preview && (
              <img
                className="saved-photo-preview"
                src={preview}
                alt="Preview da nova foto"
              />
            )}
            <input
              ref={input}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void choose(f);
                e.target.value = "";
              }}
            />
            <div className="saved-photo-actions">
              <button
                autoFocus
                type="button"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                Escolher arquivo
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setCamera(true)}
              >
                Tirar foto
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setFile(null);
                  setPreview("");
                  opener.current?.focus();
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary"
                disabled={busy || !file}
                onClick={() => void change(false)}
              >
                {busy ? "Salvando…" : "Salvar substituição"}
              </button>
            </div>
            <ErrorBox error={error} />
          </section>
        </div>
      )}
      {camera && (
        <InlineCamera onClose={() => setCamera(false)} onUse={choose} />
      )}
    </>
  );
}
