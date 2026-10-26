"use client";
import { useEffect, useState } from "react";
import { watchTracking } from "./tracking-refresh";

export function useTrackingRefresh<T>(
  enabled: boolean,
  load: (signal: AbortSignal) => Promise<T>,
  receive: (data: T) => void,
) {
  const [warning, setWarning] = useState("");
  useEffect(() => {
    setWarning("");
    if (!enabled) return;
    return watchTracking(load, receive, setWarning);
  }, [enabled, load, receive]);
  return warning;
}
