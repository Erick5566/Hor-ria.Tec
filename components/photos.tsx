"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { PendingPhoto, preparePhoto, uploadPhotos } from "@/lib/photos";
import { Foto, photoCategories, stamp } from "@/lib/assistencia";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox, Empty } from "./ui";
import { useWorkspace } from "./workspace";

function InlineCamera({
  onUse,
  onClose,
}: {
  onUse: (file: File) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  const start = useCallback(async () => {
    setError("");
    setCameraReady(false);
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      stream.current = next;
      if (video.current) video.current.srcObject = next;
    } catch {
      setError(
        "Não foi possível abrir a câmera. Verifique a permissão do navegador.",
      );
    }
  }, []);

  useEffect(() => {
    start();
    return () => {
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [start]);

  async function capture() {
    if (
      !video.current ||
      !cameraReady ||
      !video.current.videoWidth ||
      !video.current.videoHeight
    ) {
      setError("A câmera ainda está iniciando. Aguarde um instante e tente novamente.");
      return;
    }
    setError("");
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) return;
    stream.current?.getTracks().forEach((track) => track.stop());
    setPreview(URL.createObjectURL(blob));
  }

  return (
    <div
      className="camera-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Câmera"
    >
      <section className="camera-sheet">
        <div className="panel-head">
          <div>
            <h2>Tirar foto</h2>
            <p>Posicione o equipamento dentro da área.</p>
          </div>
          <button
            type="button"
            className="close"
            onClick={onClose}
            aria-label="Fechar câmera"
          >
            ×
          </button>
        </div>
        {error && <ErrorBox error={error} />}
        {preview ? (
          <img className="camera-preview" src={preview} alt="Foto capturada" />
        ) : (
          <video
            ref={video}
            className="camera-preview"
            autoPlay
            muted
            playsInline
            onLoadedMetadata={() => setCameraReady(true)}
            onPlaying={() => setCameraReady(true)}
          />
        )}
        <div className="camera-actions">
          {preview ? (
            <>
              <button
                type="button"
                className="outline"
                onClick={() => {
                  URL.revokeObjectURL(preview);
                  setPreview("");
                  start();
                }}
              >
                Tirar novamente
              </button>
              <button
                type="button"
                className="primary"
                onClick={async () => {
                  const blob = await fetch(preview).then((response) =>
                    response.blob(),
                  );
                  onUse(
                    new File([blob], `camera-${Date.now()}.jpg`, {
                      type: "image/jpeg",
                    }),
                  );
                  onClose();
                }}
              >
                Usar esta foto
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary camera-shutter"
              onClick={capture}
              disabled={!cameraReady}
              aria-label={cameraReady ? "Tirar foto" : "Aguardando câmera"}
            >
              <span className="camera-shutter-icon" aria-hidden="true" />
              <span className="camera-shutter-copy">
                <strong>{cameraReady ? "Tirar foto" : "Abrindo câmera…"}</strong>
                <small>{cameraReady ? "Toque para capturar" : "Aguarde um instante"}</small>
              </span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
export function PhotoPicker({
  value,
  onChange,
  category = "Entrada",
  publicMode = false,
}: {
  value: PendingPhoto[];
  onChange: (p: PendingPhoto[]) => void;
  category?: string;
  publicMode?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [zoom, setZoom] = useState(""),
    [cameraOpen, setCameraOpen] = useState(false);
  const fallbackCamera = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);
  useEffect(
    () => () => {
      urls.current.forEach(URL.revokeObjectURL);
    },
    [],
  );
  async function addFiles(files: File[]) {
    if (!files.length) return;
    setError("");
    setBusy(true);
    const pending: PendingPhoto[] = [];
    try {
      if (value.length + files.length > 15)
        throw new Error("Adicione até 15 fotos por envio.");
      const preparedFiles = await Promise.all(files.map(preparePhoto));
      for (const prepared of preparedFiles) {
        const preview = URL.createObjectURL(prepared);
        urls.current.push(preview);
        pending.push({
          id: crypto.randomUUID(),
          file: prepared,
          preview,
          categoria: category,
          descricao: "",
        });
      }
      onChange([...value, ...pending]);
    } catch (e) {
      setError(message(e as Error));
    } finally {
      setBusy(false);
    }
  }
  const choose = (files: FileList | null) =>
    addFiles(files ? Array.from(files) : []);
  return (
    <div>
      <h2>
        {publicMode ? "Adicionar fotos do problema" : "Fotos do equipamento"}
      </h2>
      <p>
        {publicMode
          ? "Mostre onde está o problema."
          : "Registre o estado do equipamento no momento da entrada."}
      </p>
      <p className="hint">
        Recomendamos registrar pelo menos uma foto do equipamento antes de
        iniciar o atendimento.
      </p>
      <div className="upload-actions">
        <button
          className="primary"
          type="button"
          disabled={busy}
          onClick={() => {
            if (navigator.mediaDevices) setCameraOpen(true);
            else fallbackCamera.current?.click();
          }}
        >
          ◎ Tirar foto
        </button>
        <input
          ref={fallbackCamera}
          className="camera-fallback-input"
          style={{ display: "none" }}
          type="file"
          accept="image/*"
          capture="environment"
          disabled={busy}
          onChange={(e) => {
            choose(e.target.files);
            e.target.value = "";
          }}
        />
        <label className="outline">
          + Adicionar fotos
          <input
            style={{ display: "none" }}
            type="file"
            accept="image/*"
            multiple
            disabled={busy}
            onChange={(e) => {
              choose(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <p className="hint">
        Frente · Traseira · Laterais · Tela · Conectores · Acessórios · Área
        danificada
      </p>
      {busy && <p role="status">Preparando fotos…</p>}
      <ErrorBox error={error} />
      <div className="photos-grid">
        {value.map((p, i) => (
          <article className="photo-card" key={p.id}>
            <button
              type="button"
              style={{ padding: 0, width: "100%" }}
              onClick={() => setZoom(p.preview)}
              aria-label={`Ampliar foto ${i + 1}`}
            >
              <img src={p.preview} alt={`Foto ${i + 1} do equipamento`} loading="lazy" decoding="async" />
            </button>
            <div className="photo-meta">
              {!publicMode && (
                <label>
                  Categoria
                  <select
                    value={p.categoria}
                    onChange={(e) =>
                      onChange(
                        value.map((x, j) =>
                          i === j ? { ...x, categoria: e.target.value } : x,
                        ),
                      )
                    }
                  >
                    {photoCategories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                Observação
                <input
                  maxLength={1000}
                  value={p.descricao}
                  onChange={(e) =>
                    onChange(
                      value.map((x, j) =>
                        i === j ? { ...x, descricao: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <button
                type="button"
                disabled={p.uploaded}
                onClick={() => {
                  if (!window.confirm("Remover esta foto do rascunho?")) return;
                  onChange(value.filter((x) => x.id !== p.id));
                }}
              >
                Remover foto
              </button>
              {p.saved && <small>Salva</small>}
            </div>
          </article>
        ))}
      </div>
      {zoom && (
        <div
          className="lightbox"
          role="dialog"
          aria-label="Foto ampliada"
          onClick={() => setZoom("")}
        >
          <button type="button" aria-label="Fechar foto">
            ×
          </button>
          <img src={zoom} alt="Equipamento ampliado" />
        </div>
      )}
      {cameraOpen && (
        <InlineCamera
          onClose={() => setCameraOpen(false)}
          onUse={(file) => addFiles([file])}
        />
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
          />
          {pending.length > 0 && (
            <button className="primary" disabled={busy} onClick={upload}>
              {busy ? "Enviando…" : "Salvar fotos no histórico"}
            </button>
          )}
        </section>
      )}
      <section className="panel">
        <h2>Histórico visual</h2>
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
