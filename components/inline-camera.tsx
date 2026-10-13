"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ErrorBox } from "./ui";

export default function InlineCamera({
  onUse,
  onClose,
  onCancel,
  guideLabel,
  guideInstruction,
  autoStart = true,
}: {
  onUse: (file: File) => void;
  onClose: () => void;
  onCancel?: () => void;
  guideLabel?: string;
  guideInstruction?: string;
  autoStart?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef(0);
  const mounted = useRef(true);
  const previewUrl = useRef("");
  const [preview, setPreview] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [device, setDevice] = useState("");
  const stop = useCallback(() => {
    request.current++;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }, []);
  const clearPreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = "";
    setPreview("");
    setPhoto(null);
  };
  useEffect(() => {
    mounted.current = true;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const hide = () => {
      stop();
      setReady(false);
      setBusy(false);
    };
    const visibility = () => {
      if (document.hidden) hide();
    };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visibility);
    if (autoStart) void start();
    return () => {
      mounted.current = false;
      stop();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      document.body.style.overflow = overflow;
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [stop, autoStart]);
  async function start(nextFacing = facing, nextDevice = "") {
    stop();
    clearPreview();
    setError("");
    setReady(false);
    setBusy(true);
    const token = request.current;
    try {
      if (!window.isSecureContext)
        throw new Error(
          "Abra o sistema por HTTPS para usar a câmera ao vivo. Feche a câmera para usar a Galeria.",
        );
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Este navegador não oferece câmera ao vivo. Feche este diálogo e use a Galeria.",
        );
      let next: MediaStream;
      try {
        next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: nextDevice
            ? { deviceId: { exact: nextDevice } }
            : { facingMode: { ideal: nextFacing } },
        });
      } catch (caught) {
        if ((caught as DOMException).name !== "OverconstrainedError")
          throw caught;
        next = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }
      if (!mounted.current || token !== request.current) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = next;
      setFacing(nextFacing);
      setDevice(next.getVideoTracks()[0]?.getSettings().deviceId || "");
      if (video.current) {
        video.current.srcObject = next;
        await video.current.play();
      }
      if (!mounted.current || token !== request.current) return;
      setReady(true);
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (mounted.current && token === request.current)
          setDevices(list.filter((d) => d.kind === "videoinput"));
      } catch {
        /* Camera remains usable if enumeration is unavailable. */
      }
    } catch (caught) {
      if (!mounted.current || token !== request.current) return;
      stop();
      setBusy(false);
      const e = caught as Error;
      setError(
        e.name === "NotAllowedError"
          ? "Permissão da câmera negada. Nas configurações deste site no Safari/Chrome, permita a câmera e tente novamente. Feche a câmera para usar a Galeria."
          : e.name === "NotFoundError"
            ? "Nenhuma câmera encontrada. Conecte uma webcam ou feche este diálogo para usar a Galeria."
            : e.name === "NotReadableError"
              ? "A câmera está ocupada ou indisponível. Feche outros aplicativos de câmera e tente novamente, ou feche este diálogo para usar a Galeria."
              : e.message ||
                "Não foi possível iniciar a câmera. Feche este diálogo para usar a Galeria.",
      );
    } finally {
      if (mounted.current && token === request.current) setBusy(false);
    }
  }
  async function capture() {
    const element = video.current;
    if (!ready || !element?.videoWidth) {
      setError("A câmera ainda está iniciando. Aguarde e tente novamente.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        1600 / Math.max(element.videoWidth, element.videoHeight),
      );
      canvas.width = Math.round(element.videoWidth * scale);
      canvas.height = Math.round(element.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setBusy(false);
        setError("Não foi possível preparar a foto.");
        return;
      }
      ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
      stop();
      setReady(false);
      const token = request.current;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.86),
      );
      if (!mounted.current || token !== request.current) return;
      setBusy(false);
      if (!blob) {
        setError(
          "Não foi possível gerar a foto. Ative a câmera e tente novamente.",
        );
        return;
      }
      const file = new File([blob], `camera-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });
      setPhoto(file);
      previewUrl.current = URL.createObjectURL(file);
      setPreview(previewUrl.current);
    } catch (caught) {
      stop();
      if (mounted.current) {
        setReady(false);
        setError(
          "Não foi possível capturar a foto. Ative a câmera novamente ou feche este diálogo para usar a Galeria.",
        );
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const close = () => {
    stop();
    (onCancel || onClose)();
  };
  const useFile = (file?: File) => {
    if (!file) return;
    stop();
    onUse(file);
    onClose();
  };
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="camera-backdrop camera-backdrop-portal"
      role="dialog"
      aria-modal="true"
      aria-label="Câmera"
    >
      <section className="camera-sheet camera-controls-separated">
        <div className="panel-head">
          <div>
            <h2>{guideLabel ? `Foto: ${guideLabel}` : "Tirar foto"}</h2>
            <p>
              {guideInstruction || "Posicione o equipamento dentro da área."}
            </p>
          </div>
          <button
            type="button"
            className="close"
            onClick={close}
            aria-label="Fechar câmera"
          >
            ×
          </button>
        </div>
        <ErrorBox error={error} />
        <div className="camera-stage">
          <video
            ref={video}
            className="camera-preview camera-preview-live"
            autoPlay
            muted
            playsInline
            style={{ display: preview ? "none" : "block" }}
          />
          {preview && (
            <img
              className="camera-preview"
              src={preview}
              alt="Foto capturada"
            />
          )}
        </div>
        <div className="camera-actions">
          {preview ? (
            <>
              <button
                type="button"
                className="outline"
                onClick={() => void start()}
              >
                Refazer
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => useFile(photo || undefined)}
              >
                Usar esta foto
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => (ready ? void capture() : void start())}
              >
                {busy
                  ? "Preparando câmera…"
                  : ready
                    ? "Tirar foto"
                    : "Ativar câmera"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

