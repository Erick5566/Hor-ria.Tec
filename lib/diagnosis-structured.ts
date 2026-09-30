export type DiagnosisTestStatus = "" | "ok" | "falha" | "na";

export type DiagnosisTestItem = {
  key: string;
  label: string;
  status: DiagnosisTestStatus;
  note: string;
};

export type DiagnosisPartStatus =
  | "A pedir"
  | "Pedida"
  | "Em estoque"
  | "Recebida";

export type DiagnosisPart = {
  id: string;
  stockId?: string;
  nome: string;
  quantidade: number;
  custo: number;
  valor: number;
  status: DiagnosisPartStatus;
};

export const DIAGNOSIS_TESTS = [
  ["tela", "Tela"],
  ["touch", "Touch"],
  ["cameras", "Câmeras"],
  ["audio", "Áudio/alto-falante"],
  ["microfone", "Microfone"],
  ["wifi_bluetooth", "Wi-Fi/Bluetooth"],
  ["carregamento", "Carregamento"],
  ["bateria", "Bateria"],
  ["botoes", "Botões"],
  ["biometria", "Biometria"],
] as const;

const TESTS_PREFIX = "HORARIA_TESTS_V1:";
const PARTS_PREFIX = "HORARIA_PARTS_V1:";

export function emptyDiagnosisTests(): DiagnosisTestItem[] {
  return DIAGNOSIS_TESTS.map(([key, label]) => ({
    key,
    label,
    status: "",
    note: "",
  }));
}

export function parseDiagnosisTests(raw?: string | null) {
  const fallback = { items: emptyDiagnosisTests(), legacyText: "" };
  if (!raw) return fallback;
  if (!raw.startsWith(TESTS_PREFIX))
    return { ...fallback, legacyText: raw };

  try {
    const parsed = JSON.parse(raw.slice(TESTS_PREFIX.length)) as {
      items?: DiagnosisTestItem[];
      legacyText?: string;
    };
    const byKey = new Map(
      (parsed.items || []).map((item) => [item.key, item] as const),
    );
    return {
      items: emptyDiagnosisTests().map((item) => {
        const saved = byKey.get(item.key);
        return saved
          ? {
              ...item,
              status: ["ok", "falha", "na"].includes(saved.status)
                ? saved.status
                : "",
              note: typeof saved.note === "string" ? saved.note : "",
            }
          : item;
      }),
      legacyText:
        typeof parsed.legacyText === "string" ? parsed.legacyText : "",
    };
  } catch {
    return { ...fallback, legacyText: raw };
  }
}

export function serializeDiagnosisTests(
  items: DiagnosisTestItem[],
  legacyText = "",
) {
  return (
    TESTS_PREFIX +
    JSON.stringify({
      items,
      legacyText: legacyText.trim(),
    })
  );
}

export function diagnosisTestsSummary(items: DiagnosisTestItem[]) {
  const labels: Record<Exclude<DiagnosisTestStatus, "">, string> = {
    ok: "OK",
    falha: "com falha",
    na: "N/A",
  };
  const tested = items.filter((item) => item.status);
  if (!tested.length) return "Testes: nenhum item testado ainda.";
  return `Testes: ${tested
    .map(
      (item) =>
        `${item.label} ${labels[item.status as Exclude<DiagnosisTestStatus, "">]}${
          item.note.trim() ? ` (${item.note.trim()})` : ""
        }`,
    )
    .join(", ")}.`;
}

export function parseDiagnosisParts(raw?: string | null) {
  if (!raw) return { items: [] as DiagnosisPart[], legacyText: "" };
  if (!raw.startsWith(PARTS_PREFIX))
    return { items: [] as DiagnosisPart[], legacyText: raw };

  try {
    const parsed = JSON.parse(raw.slice(PARTS_PREFIX.length)) as {
      items?: DiagnosisPart[];
      legacyText?: string;
    };
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .filter((item) => item && typeof item.nome === "string")
          .map((item) => ({
            id: item.id || crypto.randomUUID(),
            stockId: item.stockId || undefined,
            nome: item.nome,
            quantidade: Number.isFinite(Number(item.quantidade))
              ? Math.max(1, Number(item.quantidade))
              : 1,
            custo: Number.isFinite(Number(item.custo))
              ? Math.max(0, Number(item.custo))
              : 0,
            valor: Number.isFinite(Number(item.valor))
              ? Math.max(0, Number(item.valor))
              : 0,
            status: (
              ["A pedir", "Pedida", "Em estoque", "Recebida"] as const
            ).includes(item.status)
              ? item.status
              : "A pedir",
          }))
      : [];
    return {
      items,
      legacyText:
        typeof parsed.legacyText === "string" ? parsed.legacyText : "",
    };
  } catch {
    return { items: [] as DiagnosisPart[], legacyText: raw };
  }
}

export function serializeDiagnosisParts(
  items: DiagnosisPart[],
  legacyText = "",
) {
  return (
    PARTS_PREFIX +
    JSON.stringify({
      items,
      legacyText: legacyText.trim(),
    })
  );
}
