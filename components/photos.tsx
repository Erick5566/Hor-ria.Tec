"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import InlineCamera from "./inline-camera";
import SavedPhotoActions from "./saved-photo-actions";
import { cleanupSavedPhotos } from "@/lib/photo-corrections";
import { PendingPhoto, preparePhoto, uploadPhotos } from "@/lib/photos";
import { Foto, photoCategories, stamp } from "@/lib/assistencia";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox, Empty, PanelTitle } from "./ui";
import { useWorkspace } from "./workspace";
import { guidedPhotoAngles, hasFrontAndBack, onlyFrontAndBack, type GuidedPhotoState, type PhotoAngle } from "@/lib/photo-angles";
export { guidedPhotoAngles, hasFrontAndBack, onlyFrontAndBack } from "@/lib/photo-angles";
export type { GuidedPhotoState, PhotoAngle } from "@/lib/photo-angles";

const photoInstructions: Record<PhotoAngle, string> = {
  Frente: "Mostre a frente inteira do aparelho.",
  Traseira: "Mostre a traseira inteira do aparelho.",
};

export function hasFrontAndBack(photos: Pick<PendingPhoto, "angulo">[]) {
  return guidedPhotoAngles.every((angle) =>
    photos.some((photo) => photo.angulo === angle),
  );
}

export function onlyFrontAndBack(photos: PendingPhoto[]): PendingPhoto[] {
  // Rascunhos antigos podem ter 7 ângulos; não enviar imagens além das duas
  // solicitadas. Fotos já salvas de OS antigas não são alteradas.
  return guidedPhotoAngles.flatMap((angle) => {
    const found = [...photos].reverse().find((photo) => photo.angulo === angle);
    return found ? [found] : [];
  });
}

export function GuidedPhotoSequence({
  value,
  onChange,
  state,
  onStateChange,
  onComplete,
  required = false,
}: {
  value: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  state: GuidedPhotoState;
  onStateChange: (state: GuidedPhotoState) => void;
  onComplete: () => void;
  required?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraAngle, setCameraAngle] = useState<PhotoAngle | null>(null);
  const [zoom, setZoom] = useState("");
  const galleryInput = useRef<HTMLInputElement>(null);
  const selectedGalleryAngle = useRef<PhotoAngle>("Frente");
  const completed = hasFrontAndBack(value);
  const canContinue = !required || completed;
  const canContinue = !required || completed;

  async function savePhoto(file: File, angle: PhotoAngle) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const prepared = await preparePhoto(file);
      const next: PendingPhoto = {
        id: crypto.randomUUID(),
        file: prepared,
        preview: URL.createObjectURL(prepared),
        categoria: "Entrada",
        descricao: "",
        angulo: angle,
        // Refazer a foto exige novo envio, sem reutilizar estado do upload anterior.
        uploaded: false,
        saved: false,
      };
      const updated = [
        ...onlyFrontAndBack(value).filter((item) => item.angulo !== angle),
        next,
      ];
      onChange(onlyFrontAndBack(updated));
      onStateChange({
        currentIndex: updated.some((item) => item.angulo === "Frente") ? 1 : 0,
        skipped: [],
        resumeIndex: null,
      });
    } catch (cause) {
      setError(message(cause as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="guided-photo-flow photo-two-step">
      <div className="guided-photo-top">
        <div>
          <small>Etapa 3 · Registro do aparelho</small>
          <h2>Duas fotos e pronto</h2>
          <p className="hint">Registre só a frente e a traseira. Não é necessário fotografar laterais, conectores ou acessórios.</p>
        </div>
        <strong>{guidedPhotoAngles.filter((angle) => value.some((photo) => photo.angulo === angle)).length} de 2</strong>
      </div>
      <div className="guided-photo-progress" aria-label="Progresso das fotos">
        {guidedPhotoAngles.map((angle) => (
          <span className={value.some((photo) => photo.angulo === angle) ? "done" : "future"} key={angle} />
        ))}
      </div>
      <div className="photo-two-grid">
        {guidedPhotoAngles.map((angle, index) => {
          const photo = value.find((item) => item.angulo === angle);
          return (
            <article className={"photo-two-card" + (photo ? " photo-two-done" : "")} key={angle}>
              <div className="photo-two-card-title">
                <span className="photo-two-number">{index + 1}</span>
                <div>
                  <h3>{angle} do aparelho</h3>
                  <small>{photo ? "✓ Foto adicionada" : photoInstructions[angle]}</small>
                </div>
              </div>
              {photo ? (
                <button type="button" className="photo-two-preview"
                  onClick={() => setZoom(photo.preview)}
                  aria-label={`Ampliar foto da ${angle.toLowerCase()}`}>
                  <img src={photo.preview} alt={`Foto da ${angle.toLowerCase()} do aparelho`} />
                </button>
              ) : (
                <div className="photo-two-placeholder" aria-hidden="true">
                  <span>◎</span>
                  <small>Sem foto</small>
                </div>
              )}
              <div className="photo-two-actions">
                <button className="primary" type="button" disabled={busy}
                  onClick={() => setCameraAngle(angle)}>
                  {photo ? "Refazer foto" : "Tirar foto"}
                </button>
                <button className="outline" type="button" disabled={busy}
                  onClick={() => {
                    selectedGalleryAngle.current = angle;
                    galleryInput.current?.click();
                  }}>
                  Galeria
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <input ref={galleryInput} hidden type="file" accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void savePhoto(file, selectedGalleryAngle.current);
          event.target.value = "";
        }}
      />
      {busy && <p role="status" className="hint">Preparando foto…</p>}
      <ErrorBox error={error} />
      <div className="photo-two-bottom">
        <p className="hint">{completed ? "Frente e traseira registradas." : required ? "Adicione as duas fotos para continuar." : "Fotos opcionais nesta assistência. Você pode continuar sem fotografar."}</p>
        <button type="button" className="primary" disabled={!canContinue || busy}
          onClick={() => { if (canContinue) onComplete(); }}>
          Continuar →
        </button>
      </div>
      {cameraAngle && (
        <InlineCamera
          guideLabel={cameraAngle}
          guideInstruction={photoInstructions[cameraAngle]}
          onClose={() => setCameraAngle(null)}
          onUse={(file) => void savePhoto(file, cameraAngle)}
        />
      )}
      {zoom && (
        <div className="lightbox" role="dialog" aria-label="Foto ampliada"
          onClick={() => setZoom("")}>
          <button type="button" aria-label="Fechar foto">×</button>
          <img src={zoom} alt="Registro do equipamento ampliado" />
        </div>
      )}
    </section>
  );
}

export function PhotoPicker({
  value,
  onChange,
  category = "Entrada",
  publicMode = false,
  onCameraConfirm,
}: {
  value: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  category?: string;
  publicMode?: boolean;
  onCameraConfirm?: (file: File, angle: PhotoAngle) => Promise<void> | void;
  suggestedChecklist?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraAngle, setCameraAngle] = useState<PhotoAngle | null>(null);
  const [zoom, setZoom] = useState("");
  const galleryInput = useRef<HTMLInputElement>(null);
  const selectedGalleryAngle = useRef<PhotoAngle>("Frente");

  async function addFile(file: File, angle: PhotoAngle, fromCamera = false) {
    setBusy(true);
    setError("");
    try {
      if (fromCamera && onCameraConfirm) {
        await onCameraConfirm(file, angle);
      } else {
        const prepared = await preparePhoto(file);
        const next = {
          id: previous?.id || crypto.randomUUID(),
          file: prepared,
          preview: URL.createObjectURL(prepared),
          categoria: category,
          descricao: "",
          angulo: angle,
          saved: false,
          uploaded: false,
        };
        onChange(onlyFrontAndBack([
          ...value.filter((item) => item.angulo !== angle),
          next,
        ]));
      }
    } catch (cause) {
      setError(message(cause as Error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="photo-two-step">
      <div className="guided-photo-top">
        <div>
          <h2>{publicMode ? "Fotos do aparelho" : "Registro fotográfico"}</h2>
          <p className="hint">Somente frente e traseira. As fotos anteriores continuam no histórico.</p>
        </div>
      </div>
      <div className="photo-two-grid">
        {guidedPhotoAngles.map((angle) => {
          const photo = value.find((item) => item.angulo === angle);
          return (
            <article className={"photo-two-card" + (photo ? " photo-two-done" : "")} key={angle}>
              <div className="photo-two-card-title">
                <strong>{angle} do aparelho</strong>
                <small>{photo ? "✓ Pronta para salvar" : photoInstructions[angle]}</small>
              </div>
              {photo ? (
                <button type="button" className="photo-two-preview"
                  onClick={() => setZoom(photo.preview)} aria-label={`Ampliar foto da ${angle.toLowerCase()}`}>
                  <img src={photo.preview} alt={`Foto da ${angle.toLowerCase()} do aparelho`} />
                </button>
              ) : (
                <div className="photo-two-placeholder" aria-hidden="true"><span>◎</span><small>Sem foto nova</small></div>
              )}
              <div className="photo-two-actions">
                <button type="button" className="primary" disabled={busy}
                  onClick={() => setCameraAngle(angle)}>
                  {photo ? "Refazer foto" : "Tirar foto"}
                </button>
                <button type="button" className="outline" disabled={busy}
                  onClick={() => { selectedGalleryAngle.current = angle; galleryInput.current?.click(); }}>
                  Galeria
                </button>
              </div>
            </article>
          );
        })}
      </div>
      <input ref={galleryInput} hidden type="file" accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void addFile(file, selectedGalleryAngle.current);
          event.target.value = "";
        }}
      />
      {busy && <p role="status">Preparando foto…</p>}
      <ErrorBox error={error} />
      {cameraAngle && (
        <InlineCamera
          guideLabel={cameraAngle}
          guideInstruction={photoInstructions[cameraAngle]}
          onClose={() => setCameraAngle(null)}
          onUse={(file) => void addFile(file, cameraAngle, true)}
        />
      )}
      {zoom && (
        <div className="lightbox" role="dialog" aria-label="Foto ampliada" onClick={() => setZoom("")}>
          <button type="button" aria-label="Fechar foto">×</button>
          <img src={zoom} alt="Registro ampliado" />
        </div>
      )}
    </div>
  );
}

export function PhotosPanel({
  ordemId,
  empresaId,
  readOnly = false,
  category = "Entrada",
}: {
  ordemId: string;
  empresaId: string;
  readOnly?: boolean;
  category?: string;
}) {
  const { userId, email } = useWorkspace();
  const [photos, setPhotos] = useState<(Foto & { signed: string })[]>([]),
    [pending, setPending] = useState<PendingPhoto[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [zoom, setZoom] = useState("");
  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase!
        .from("fotos_os")
        .select("*")
        .eq("ordem_id", ordemId)
        .order("criado_em");
      if (error) throw error;
      const rows = data as Foto[];
      if (!rows.length) {
        setPhotos([]);
        return;
      }
      const signedResult = await supabase!.storage
        .from("os-fotos")
        .createSignedUrls(
          rows.map((photo) => photo.caminho),
          3600,
        );
      if (signedResult.error) throw signedResult.error;
      const signedByPath = new Map(
        (signedResult.data || []).map((item) => [
          item.path,
          item.signedUrl || "",
        ]),
      );
      setPhotos(
        rows.map((photo) => ({
          ...photo,
          signed: signedByPath.get(photo.caminho) || "",
        })),
      );
    } catch (e) {
      setError(message(e as Error));
    }
  }, [ordemId]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (!readOnly) void cleanupSavedPhotos(ordemId).catch(() => false);
  }, [ordemId, readOnly]);
  async function saveCameraPhoto(file: File, angle: PhotoAngle) {
    setBusy(true);
    setError("");
    try {
      const prepared = await preparePhoto(file);
      const cameraPhoto: PendingPhoto = {
        id: crypto.randomUUID(),
        file: prepared,
        preview: "",
        categoria: category,
        descricao: "",
        angulo: angle,
      };
      await uploadPhotos(empresaId, ordemId, [cameraPhoto]);
      await load();
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    setBusy(true);
    setError("");
    try {
      await uploadPhotos(empresaId, ordemId, pending);
      setPending([]);
      await load();
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ErrorBox error={error} />
      {!readOnly && (
        <section className="panel">
          <PhotoPicker
            category={category}
            value={pending}
            onChange={setPending}
            onCameraConfirm={saveCameraPhoto}
          />
          {busy && <p role="status">Salvando foto…</p>}
          {pending.length > 0 && (
            <button className="primary" disabled={busy} onClick={upload}>
              {busy ? "Enviando…" : "Salvar fotos no histórico"}
            </button>
          )}
        </section>
      )}
      <section className="panel">
        <PanelTitle title="Histórico visual" icon="devices" />
        {!photos.length && (
          <Empty title="Nenhuma foto registrada nesta ordem." />
        )}
        {photoCategories.map((category) => {
          const group = photos.filter((p) => p.categoria === category);
          return (
            group.length > 0 && (
              <section key={category}>
                <h3>{category}</h3>
                <div className="photos-grid">
                  {group.map((p) => (
                    <article className="photo-card" key={p.id}>
                      <button
                        style={{ padding: 0, width: "100%" }}
                        aria-label={`Ampliar foto de ${p.categoria}`}
                        onClick={() => setZoom(p.signed)}
                      >
                        <img
                          src={p.signed}
                          alt={p.descricao || p.categoria}
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                      <div className="photo-meta">
                        <strong>{stamp(p.criado_em)}</strong>
                        <p>{p.usuario_id === userId ? email : p.autor}</p>
                        <p>{p.descricao}</p>
                        {!readOnly && <SavedPhotoActions orderId={ordemId} photoId={p.id}
                          description={p.descricao || p.categoria} onChanged={load}
                          onCleanupPending={() => setError("Foto corrigida. A limpeza do arquivo anterior está pendente e será tentada ao reabrir a galeria.")} />}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )
          );
        })}
      </section>
      {zoom && (
        <div
          className="lightbox"
          role="dialog"
          aria-label="Foto ampliada"
          onClick={() => setZoom("")}
        >
          <button aria-label="Fechar">×</button>
          <img src={zoom} alt="Registro do equipamento" />
        </div>
      )}
    </>
  );
}
