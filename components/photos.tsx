"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { PendingPhoto, preparePhoto, uploadPhotos } from "@/lib/photos";
import { Foto, photoCategories, stamp } from "@/lib/assistencia";
import { supabase, message } from "@/lib/supabase";
import { ErrorBox, Empty } from "./ui";
import { useWorkspace } from "./workspace";

function InlineCamera({
  onUse,
  onClose,
  onCancel,
  guideLabel,
  guideInstruction,
}: {
  onUse: (file: File) => void;
  onClose: () => void;
  onCancel?: () => void;
  guideLabel?: string;
  guideInstruction?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState("");
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  const start = useCallback(async () => {
    setError("");
    setCameraReady(false);
    try {
      let next: MediaStream;
      try {
        // Prioriza explicitamente a câmera traseira para evitar que alguns
        // navegadores móveis abram a frontal/espelhada por padrão.
        next = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: "environment" } },
          audio: false,
        });
      } catch {
        next = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      }
      stream.current = next;
      if (video.current) {
        video.current.srcObject = next;
        video.current.style.transform = "none";
      }
    } catch {
      setError(
        "Não foi possível abrir a câmera traseira. Verifique a permissão do navegador.",
      );
    }
  }, []);

  useEffect(() => {
    start();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      stream.current?.getTracks().forEach((track) => track.stop());
      document.body.style.overflow = previousOverflow;
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
    if (!blob) {
      setError("Não foi possível gerar a foto. Tente novamente.");
      return;
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    setCapturedBlob(blob);
    setPreview(URL.createObjectURL(blob));
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="camera-backdrop camera-backdrop-portal"
      role="dialog"
      aria-modal="true"
      aria-label="Câmera"
    >
      <section className="camera-sheet">
        <div className="panel-head">
          <div>
            <h2>{guideLabel ? `Foto: ${guideLabel}` : "Tirar foto"}</h2>
            <p>
              {guideInstruction ||
                "Posicione o equipamento dentro da área."}
            </p>
          </div>
          <button
            type="button"
            className="close"
            onClick={onCancel || onClose}
            aria-label="Fechar câmera"
          >
            ×
          </button>
        </div>
        {error && <ErrorBox error={error} />}
        <div className="camera-stage">
          {guideLabel && (
            <div className="camera-guide-overlay" aria-hidden="true">
              <div className="camera-guide-frame">
                <span>Alinhe aqui</span>
              </div>
            </div>
          )}
          {preview ? (
            <img className="camera-preview" src={preview} alt="Foto capturada" />
          ) : (
            <>
              <video
                ref={video}
                className="camera-preview camera-preview-live"
                autoPlay
                muted
                playsInline
                onLoadedMetadata={() => setCameraReady(true)}
                onPlaying={() => setCameraReady(true)}
              />
              <div className="camera-live-action">
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
              </div>
            </>
          )}
        </div>
        {guideInstruction && (
          <p className="camera-guide-instruction">{guideInstruction}</p>
        )}

        {preview && (
          <div className="camera-actions">
            <button
              type="button"
              className="outline"
              onClick={() => {
                URL.revokeObjectURL(preview);
                setPreview("");
                setCapturedBlob(null);
                void start();
              }}
            >
              Tirar novamente
            </button>
            <button
              type="button"
              className="primary"
              disabled={!capturedBlob}
              onClick={() => {
                if (!capturedBlob) {
                  setError("A foto ainda não está pronta. Tire a foto novamente.");
                  return;
                }
                const file = new File(
                  [capturedBlob],
                  `camera-${Date.now()}.jpg`,
                  { type: "image/jpeg" },
                );
                onUse(file);
                URL.revokeObjectURL(preview);
                setPreview("");
                setCapturedBlob(null);
                onClose();
              }}
            >
              Usar esta foto
            </button>
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
export const guidedPhotoAngles = [
  "Frente",
  "Traseira",
  "Laterais",
  "Tela",
  "Conectores",
  "Acessórios",
  "Área danificada",
] as const;

const suggestedPhotoAngles = guidedPhotoAngles;

export type GuidedPhotoState = {
  currentIndex: number;
  skipped: string[];
  resumeIndex: number | null;
};

const guidedPhotoInstructions: Record<(typeof guidedPhotoAngles)[number], string> = {
  Frente:
    "Centralize a frente do aparelho dentro da moldura, mostrando o equipamento inteiro com boa iluminação.",
  Traseira:
    "Centralize a parte de trás do aparelho dentro da moldura, com boa iluminação e sem reflexos.",
  Laterais:
    "Fotografe as laterais de forma que bordas, botões e possíveis marcas fiquem visíveis.",
  Tela:
    "Ligue a tela do aparelho, se possível, e evite reflexos de luz para registrar riscos, manchas ou trincas.",
  Conectores:
    "Aproxime os conectores e entradas sem perder o foco, mostrando sujeira, oxidação ou danos visíveis.",
  Acessórios:
    "Organize carregador, cabo, capa e outros acessórios entregues ao lado do aparelho e enquadre todos.",
  "Área danificada":
    "Aproxime a área danificada, mantenha o foco e registre o defeito com detalhe suficiente para comparação futura.",
};

export function GuidedPhotoSequence({
  value,
  onChange,
  state,
  onStateChange,
  onComplete,
}: {
  value: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  state: GuidedPhotoState;
  onStateChange: (state: GuidedPhotoState) => void;
  onComplete: () => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [zoom, setZoom] = useState("");
  const galleryInput = useRef<HTMLInputElement>(null);
  const fallbackCamera = useRef<HTMLInputElement>(null);

  const finished =
    state.currentIndex >= guidedPhotoAngles.length &&
    state.resumeIndex === null;
  const activeIndex = Math.min(
    Math.max(state.currentIndex, 0),
    guidedPhotoAngles.length - 1,
  );
  const activeAngle = guidedPhotoAngles[activeIndex];
  const activeInstruction = guidedPhotoInstructions[activeAngle];
  const activeExisting = value.find((photo) => photo.angulo === activeAngle);

  function statusFor(index: number) {
    const angle = guidedPhotoAngles[index];
    if (!finished && index === state.currentIndex) return "current";
    if (value.some((photo) => photo.angulo === angle)) return "done";
    if (state.skipped.includes(angle)) return "skipped";
    return "future";
  }

  async function useFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const prepared = await preparePhoto(file);
      const preview = URL.createObjectURL(prepared);
      const next: PendingPhoto = {
        id: activeExisting?.id || crypto.randomUUID(),
        file: prepared,
        preview,
        categoria: "Entrada",
        descricao: "",
        angulo: activeAngle,
      };
      const withoutCurrent = value.filter(
        (photo) => photo.angulo !== activeAngle,
      );
      onChange([...withoutCurrent, next]);
      const nextIndex =
        state.resumeIndex !== null
          ? state.resumeIndex
          : Math.min(guidedPhotoAngles.length, state.currentIndex + 1);
      onStateChange({
        ...state,
        skipped: state.skipped.filter((angle) => angle !== activeAngle),
        currentIndex: nextIndex,
        resumeIndex: null,
      });
    } catch (caught) {
      setError(message(caught as Error));
    } finally {
      setBusy(false);
    }
  }

  function openCameraCapture() {
    if (typeof navigator.mediaDevices !== "undefined") {
      setCameraOpen(true);
      return;
    }
    window.setTimeout(() => fallbackCamera.current?.click(), 0);
  }

  function revisit(index: number) {
    if (statusFor(index) !== "done" || busy) return;
    onStateChange({
      ...state,
      currentIndex: index,
      resumeIndex: finished ? guidedPhotoAngles.length : state.currentIndex,
    });
    // Ao refazer, já abrimos a câmera da etapa escolhida. O novo estado
    // é aplicado no mesmo ciclo de render e a captura substitui aquela foto.
    openCameraCapture();
  }

  function skipCurrent() {
    if (activeIndex === 0 || state.resumeIndex !== null) return;
    const nextSkipped = Array.from(
      new Set([...state.skipped, activeAngle]),
    );
    onStateChange({
      ...state,
      skipped: nextSkipped,
      currentIndex: Math.min(
        guidedPhotoAngles.length,
        state.currentIndex + 1,
      ),
    });
  }

  if (finished) {
    return (
      <section className="guided-photo-flow guided-photo-summary">
        <div className="guided-photo-top">
          <div>
            <small>Etapa 3 · Fotos</small>
            <h2>Registro fotográfico concluído</h2>
          </div>
          <strong>7 de 7 revisadas</strong>
        </div>

        <div className="guided-photo-progress" aria-label="Progresso concluído">
          {guidedPhotoAngles.map((angle, index) => (
            <span
              key={angle}
              className={statusFor(index) === "done" ? "done" : "skipped"}
            />
          ))}
        </div>

        <div className="guided-photo-summary-grid">
          {guidedPhotoAngles.map((angle, index) => {
            const photo = value.find((item) => item.angulo === angle);
            const skipped = state.skipped.includes(angle) && !photo;
            return (
              <article
                className={`guided-photo-summary-card${
                  skipped ? " is-skipped" : ""
                }`}
                key={angle}
              >
                {photo ? (
                  <button
                    type="button"
                    onClick={() => setZoom(photo.preview)}
                    aria-label={`Ampliar foto ${angle}`}
                  >
                    <img src={photo.preview} alt={`Foto: ${angle}`} />
                  </button>
                ) : (
                  <div className="guided-photo-skipped-mark">—</div>
                )}
                <div>
                  <strong>{angle}</strong>
                  <small>{photo ? "✓ Concluído" : "Pulado"}</small>
                </div>
                {photo && (
                  <button
                    type="button"
                    className="guided-photo-redo"
                    onClick={() => revisit(index)}
                  >
                    Refazer
                  </button>
                )}
              </article>
            );
          })}
        </div>

        <div className="guided-photo-summary-actions">
          <button type="button" className="primary" onClick={onComplete}>
            Continuar →
          </button>
        </div>

        {zoom && (
          <div
            className="lightbox"
            role="dialog"
            aria-label="Foto ampliada"
            onClick={() => setZoom("")}
          >
            <button type="button" aria-label="Fechar foto">×</button>
            <img src={zoom} alt="Registro do equipamento ampliado" />
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="guided-photo-flow">
      <div className="guided-photo-top">
        <div>
          <small>
            Passo {activeIndex + 1} de {guidedPhotoAngles.length}
          </small>
          <h2>{activeAngle}</h2>
        </div>
        {state.resumeIndex !== null && <strong>Refazendo foto</strong>}
      </div>

      <div className="guided-photo-progress" aria-label="Progresso das fotos">
        {guidedPhotoAngles.map((angle, index) => (
          <span key={angle} className={statusFor(index)} />
        ))}
      </div>

      <div className="guided-photo-chip-row">
        {guidedPhotoAngles.map((angle, index) => {
          const status = statusFor(index);
          const clickable = status === "done";
          return (
            <button
              type="button"
              key={angle}
              className={`guided-photo-chip ${status}`}
              disabled={!clickable}
              onClick={() => revisit(index)}
            >
              <span aria-hidden="true">
                {status === "done"
                  ? "✓"
                  : status === "skipped"
                    ? "—"
                    : status === "future"
                      ? "🔒"
                      : activeIndex + 1}
              </span>
              {angle}
            </button>
          );
        })}
      </div>

      <div className="guided-photo-reference">
        <div className="guided-photo-reference-frame">
          <span>Alinhe aqui</span>
        </div>
        <strong>{activeAngle}</strong>
        <p>{activeInstruction}</p>
      </div>

      {activeExisting && (
        <div className="guided-photo-current-preview">
          <button
            type="button"
            onClick={() => setZoom(activeExisting.preview)}
            aria-label={`Ampliar foto ${activeAngle}`}
          >
            <img
              src={activeExisting.preview}
              alt={`Foto atual: ${activeAngle}`}
            />
          </button>
          <small>Foto atual · ao capturar novamente, ela será substituída.</small>
        </div>
      )}

      <div className="guided-photo-actions">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={openCameraCapture}
        >
          ◎ {activeExisting ? "Refazer foto" : "Tirar foto"}
        </button>
        <button
          type="button"
          className="outline"
          disabled={busy}
          onClick={() => galleryInput.current?.click()}
        >
          Escolher da galeria
        </button>
        {activeIndex > 0 && state.resumeIndex === null && (
          <button
            type="button"
            className="guided-photo-skip"
            disabled={busy}
            onClick={skipCurrent}
          >
            Pular esta foto
          </button>
        )}
      </div>

      <input
        ref={fallbackCamera}
        className="camera-fallback-input"
        style={{ display: "none" }}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void useFile(file);
          event.target.value = "";
        }}
      />
      <input
        ref={galleryInput}
        style={{ display: "none" }}
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void useFile(file);
          event.target.value = "";
        }}
      />

      {busy && <p className="hint" role="status">Preparando foto…</p>}
      <ErrorBox error={error} />

      {cameraOpen && (
        <InlineCamera
          guideLabel={activeAngle}
          guideInstruction={activeInstruction}
          onClose={() => setCameraOpen(false)}
          onCancel={() => {
            setCameraOpen(false);
            if (state.resumeIndex !== null) {
              onStateChange({
                ...state,
                currentIndex: state.resumeIndex,
                resumeIndex: null,
              });
            }
          }}
          onUse={(file) => void useFile(file)}
        />
      )}

      {zoom && (
        <div
          className="lightbox"
          role="dialog"
          aria-label="Foto ampliada"
          onClick={() => setZoom("")}
        >
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
  suggestedChecklist = false,
}: {
  value: PendingPhoto[];
  onChange: (p: PendingPhoto[]) => void;
  category?: string;
  publicMode?: boolean;
  onCameraConfirm?: (file: File) => Promise<void> | void;
  suggestedChecklist?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [zoom, setZoom] = useState(""),
    [cameraOpen, setCameraOpen] = useState(false),
    [selectedAngle, setSelectedAngle] = useState("");
  const fallbackCamera = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
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
      for (const [index, prepared] of preparedFiles.entries()) {
        const preview = URL.createObjectURL(prepared);
        urls.current.push(preview);
        pending.push({
          id: crypto.randomUUID(),
          file: prepared,
          preview,
          categoria: category,
          descricao: "",
          angulo: suggestedChecklist && index === 0 ? selectedAngle : "",
        });
      }
      onChange([...value, ...pending]);
      if (suggestedChecklist && selectedAngle) setSelectedAngle("");
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
      {suggestedChecklist && (
        <>
          <div className="photo-checklist-heading">
            <strong>
              Checklist sugerido (
              {
                new Set(
                  value
                    .map((photo) => photo.angulo)
                    .filter((angle): angle is string => Boolean(angle)),
                ).size
              }{" "}
              de {suggestedPhotoAngles.length})
            </strong>
            <small>Opcional</small>
          </div>
          <div className="photo-angle-chips" aria-label="Ângulos sugeridos">
            {suggestedPhotoAngles.map((angle) => {
              const done = value.some((photo) => photo.angulo === angle);
              const selected = selectedAngle === angle;
              return (
                <button
                  type="button"
                  key={angle}
                  className={`photo-angle-chip${done ? " done" : ""}${selected ? " selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() =>
                    setSelectedAngle((current) =>
                      current === angle ? "" : angle,
                    )
                  }
                >
                  {done && <span aria-hidden="true">✓</span>}
                  {angle}
                </button>
              );
            })}
          </div>

          <div className="photo-stage-grid">
            {value.map((photo, index) => (
              <article className="photo-stage-card" key={photo.id}>
                <button
                  type="button"
                  className="photo-stage-preview"
                  onClick={() => setZoom(photo.preview)}
                  aria-label={`Ampliar foto ${index + 1}`}
                >
                  <img
                    src={photo.preview}
                    alt={`Foto ${index + 1} do equipamento`}
                    loading="lazy"
                    decoding="async"
                  />
                  {photo.angulo && (
                    <span className="photo-stage-angle">{photo.angulo}</span>
                  )}
                </button>
                <button
                  type="button"
                  className="photo-stage-remove"
                  aria-label={`Remover foto ${index + 1}`}
                  onClick={() => {
                    if (
                      !window.confirm("Remover esta foto do rascunho?")
                    )
                      return;
                    onChange(value.filter((item) => item.id !== photo.id));
                  }}
                >
                  ×
                </button>
                <label className="photo-stage-angle-select">
                  <span>Ângulo</span>
                  <select
                    value={photo.angulo || ""}
                    onChange={(event) =>
                      onChange(
                        value.map((item) =>
                          item.id === photo.id
                            ? { ...item, angulo: event.target.value }
                            : item,
                        ),
                      )
                    }
                  >
                    <option value="">Sem ângulo</option>
                    {suggestedPhotoAngles.map((angle) => (
                      <option key={angle} value={angle}>
                        {angle}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
            <button
              type="button"
              className="photo-stage-add"
              onClick={() => galleryInput.current?.click()}
              aria-label="Adicionar fotos"
            >
              <span aria-hidden="true">+</span>
              <small>Adicionar</small>
            </button>
          </div>
        </>
      )}
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
            const file = e.target.files?.[0];
            if (file && onCameraConfirm) void onCameraConfirm(file);
            else choose(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          className="outline"
          type="button"
          disabled={busy}
          onClick={() => galleryInput.current?.click()}
        >
          + Adicionar fotos
        </button>
        <input
          ref={galleryInput}
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
      </div>
      {!suggestedChecklist && (
        <p className="hint">
          Frente · Traseira · Laterais · Tela · Conectores · Acessórios · Área
          danificada
        </p>
      )}
      {busy && <p role="status">Preparando fotos…</p>}
      <ErrorBox error={error} />
      {!suggestedChecklist && (
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
      )}
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
          onUse={(file) => {
            if (onCameraConfirm) {
              void onCameraConfirm(file);
              return;
            }
            void addFiles([file]);
          }}
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
  async function saveCameraPhoto(file: File) {
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
