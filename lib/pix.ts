const PIX_GUI = "BR.GOV.BCB.PIX";

export const INITIAL_PAYMENT_AMOUNT = 44.99;
export const MONTHLY_PAYMENT_AMOUNT = 49;

function field(id: string, value: string) {
  return `${id}${String(value.length).padStart(2, "0")}${value}`;
}

function normalizeText(value: string, maxLength: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 .\-]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function pixCrc16(payload: string) {
  let crc = 0xffff;

  for (let index = 0; index < payload.length; index++) {
    crc ^= payload.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit++) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function getSubscriptionPixPayment(
  status?: "TRIAL" | "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED" | null,
  hasApprovedPayment?: boolean,
) {
  const isInitialPayment =
    hasApprovedPayment === undefined
      ? !status || status === "TRIAL"
      : !hasApprovedPayment;

  return {
    kind: isInitialPayment ? ("initial" as const) : ("monthly" as const),
    amount: isInitialPayment ? INITIAL_PAYMENT_AMOUNT : MONTHLY_PAYMENT_AMOUNT,
    heading: isInitialPayment
      ? "Pagamento inicial Horária"
      : "Mensalidade Horária",
    priceLabel: isInitialPayment ? "Valor inicial" : "Mensalidade",
    description: isInitialPayment
      ? "Pagamento inicial Horária"
      : "Mensalidade Horária",
  };
}

export function buildPixPayload({
  key,
  amount,
  merchantName,
  merchantCity,
  txid = "***",
  description,
}: {
  key: string;
  amount: number;
  merchantName: string;
  merchantCity: string;
  txid?: string;
  description?: string;
}) {
  const cleanKey = key.trim();
  if (!cleanKey) throw new Error("Chave Pix não informada.");
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error("Valor Pix inválido.");

  const merchantAccount =
    field("00", PIX_GUI) +
    field("01", cleanKey) +
    (description ? field("02", normalizeText(description, 72)) : "");

  const additionalData = field("05", normalizeText(txid, 25) || "***");

  const body =
    field("00", "01") +
    field("26", merchantAccount) +
    field("52", "0000") +
    field("53", "986") +
    field("54", amount.toFixed(2)) +
    field("58", "BR") +
    field("59", normalizeText(merchantName, 25) || "HORARIA") +
    field("60", normalizeText(merchantCity, 15) || "BRASIL") +
    field("62", additionalData);

  const payloadWithoutCrc = body + "6304";
  return payloadWithoutCrc + pixCrc16(payloadWithoutCrc);
}
