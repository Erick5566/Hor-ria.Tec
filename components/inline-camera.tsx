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
}: {
  onUse: (file: File) => void;
  onClose: () => void;
  onCancel?: () => void;
  guideLabel?: string;
  guideInstruction?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const request = useRef(0);
  const mounted = useRef(true);
  const previewUrl = useRef("");
  const native = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null);
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
    return () => {
      mounted.current = false;
      stop();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      document.body.style.overflow = overflow;
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [stop]);
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
          "Abra o sistema por HTTPS para usar a câmera ao vivo. Você também pode enviar uma foto abaixo.",
        );
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Este navegador não oferece câmera ao vivo. Use a câmera do aparelho ou escolha um arquivo abaixo.",
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
          ? "Permissão da câmera negada. Nas configurações deste site no Safari/Chrome, permita a câmera e tente novamente. Você também pode escolher um arquivo."
          : e.name === "NotFoundError"
            ? "Nenhuma câmera encontrada. Conecte uma webcam ou escolha um arquivo."
            : e.name === "NotReadableError"
              ? "A câmera está ocupada ou indisponível. Feche outros aplicativos de câmera e tente novamente, ou escolha um arquivo."
              : e.message ||
                "Não foi possível iniciar a câmera. Escolha um arquivo abaixo.",
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
          "Não foi possível capturar a foto. Ative a câmera novamente ou escolha um arquivo.",
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
      <section className="camera-sheet">
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
              <button
                type="button"
                className="outline"
                disabled={busy}
                onClick={() =>
                  void start(facing === "environment" ? "user" : "environment")
                }
              >
                Alternar frontal/traseira
              </button>
              {devices.length > 1 && (
                <label>
                  Câmera
                  <select
                    value={device}
                    disabled={busy}
                    onChange={(e) => void start(facing, e.target.value)}
                  >
                    {devices.map((d, i) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Câmera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </div>
        <div className="camera-actions">
          <button
            type="button"
            className="outline"
            onClick={() => {
              stop();
              setReady(false);
              setBusy(false);
              native.current?.click();
            }}
          >
            Câmera do aparelho
          </button>
          <button
            type="button"
            className="outline"
            onClick={() => {
              stop();
              setReady(false);
              setBusy(false);
              gallery.current?.click();
            }}
          >
            Galeria / arquivos
          </button>
        </div>
        <input
          ref={native}
          hidden
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            useFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={gallery}
          hidden
          type="file"
          accept="image/*"
          onChange={(e) => {
            useFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </section>
    </div>,
    document.body,
  );
}
