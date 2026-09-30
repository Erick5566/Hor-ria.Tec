export const RECEIPT_ZONE = "America/Fortaleza";
export function localDay(value: string | Date = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return value;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: RECEIPT_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function formatDelivery(value: string) {
  return localDay(value).split("-").reverse().join("/");
}
export function localDateTime(value: string | null) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RECEIPT_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function saveLocalDateTime(value: string) {
  return value ? new Date(`${value}:00-03:00`).toISOString() : null;
}
export function validateDelivery(value: string, received: string) {
  if (!value) return;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error("Informe uma data de entrega válida.");
  if (value < localDay(received))
    throw new Error("A entrega não pode ser anterior à data de recebimento.");
}
export function deliveryState(
  value: string | null,
  status: string,
  now = new Date(),
) {
  if (!value || ["finalizado", "cancelado"].includes(status)) return "";
  const day = localDay(value),
    today = localDay(now);
  return day < today
    ? "Entrega atrasada"
    : day === today
      ? "Entrega vence hoje"
      : "";
}
