// The public endpoint allows 10 lookups per resource in a rolling 10-minute window.
export const TRACKING_REFRESH_MS = 75_000;

export function watchTracking<T>(
  load: (signal: AbortSignal) => Promise<T>,
  receive: (data: T) => void,
  report: (message: string) => void,
) {
  let stopped = false;
  let running = false;
  let failures = 0;
  let nextAt = Date.now() + TRACKING_REFRESH_MS;
  let timer: ReturnType<typeof setTimeout>;
  let controller: AbortController | undefined;
  const visible = () =>
    document.visibilityState !== "hidden" && navigator.onLine !== false;
  const schedule = () => {
    clearTimeout(timer);
    if (!stopped && visible())
      timer = setTimeout(() => void run(), Math.max(0, nextAt - Date.now()));
  };
  const run = async () => {
    if (stopped || running || !visible()) return;
    if (Date.now() < nextAt) {
      schedule();
      return;
    }
    running = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 20_000);
    try {
      const data = await load(controller.signal);
      if (!stopped) {
        receive(data);
        report("");
        failures = 0;
      }
    } catch {
      if (!stopped) {
        failures++;
        report(
          "Não foi possível atualizar agora. Os últimos dados foram mantidos; tentaremos novamente automaticamente.",
        );
      }
    } finally {
      clearTimeout(timeout);
      running = false;
      nextAt =
        Date.now() + Math.min(TRACKING_REFRESH_MS * 2 ** failures, 600_000);
      schedule();
    }
  };
  const resume = () => {
    if (!running) schedule();
  };
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume);
  window.addEventListener("focus", resume);
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("online", resume);
    window.removeEventListener("focus", resume);
  };
}
