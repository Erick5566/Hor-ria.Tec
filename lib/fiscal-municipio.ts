/**
 * Resolve códigos IBGE sem depender de uma única API pública.
 * Os provedores são consultados em paralelo para limitar o tempo de espera.
 */
type MunicipioAPI = {
  id?: unknown;
  nome?: unknown;
  codigo_ibge?: unknown;
};

export type MunicipioResolvido = {
  codigo: string;
  cidade: string;
  uf: string;
};

type Fetcher = (
  url: string,
  init?: RequestInit & { next?: { revalidate: number } },
) => Promise<Response>;

const codigoUF: Record<string, string> = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23",
  DF: "53", ES: "32", GO: "52", MA: "21", MT: "51", MS: "50",
  MG: "31", PA: "15", PB: "25", PR: "41", PE: "26", PI: "22",
  RJ: "33", RN: "24", RS: "43", RO: "11", RR: "14", SC: "42",
  SP: "35", SE: "28", TO: "17",
};

export function ufValida(uf: string) {
  return Object.hasOwn(codigoUF, uf);
}

export function codigoMunicipioCompativel(codigo: string, uf: string) {
  const prefixo = codigoUF[uf];
  return Boolean(prefixo) && /^\d{7}$/.test(codigo) && codigo.startsWith(prefixo);
}

export function normalizarMunicipio(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function encontrarMunicipio(
  rows: MunicipioAPI[],
  cidade: string,
  uf: string,
): MunicipioResolvido | null {
  const wanted = normalizarMunicipio(cidade);

  for (const row of rows) {
    if (typeof row?.nome !== "string" || normalizarMunicipio(row.nome) !== wanted)
      continue;

    const codigo = String(row.id ?? row.codigo_ibge ?? "");
    // Nunca converter/truncar um código de origem incerta.
    if (!codigoMunicipioCompativel(codigo, uf))
      continue;

    return { codigo, cidade: row.nome, uf };
  }

  return null;
}

async function carregarMunicipios(url: string, fetcher: Fetcher): Promise<MunicipioAPI[]> {
  const response = await fetcher(url, {
    next: { revalidate: 86400 },
    signal: AbortSignal.timeout(5500),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Provedor indisponível");

  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error("Resposta de municípios inválida");
  return data as MunicipioAPI[];
}

export async function resolverMunicipio(
  cidade: string,
  uf: string,
  fetcher: Fetcher = fetch,
): Promise<{ municipio: MunicipioResolvido | null; disponivel: boolean }> {
  if (!ufValida(uf) || !normalizarMunicipio(cidade))
    return { municipio: null, disponivel: true };

  const urls = [
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
    `https://brasilapi.com.br/api/ibge/municipios/v1/${uf}?providers=gov`,
  ];

  const result = await Promise.allSettled(urls.map((url) => carregarMunicipios(url, fetcher)));

  // Dados oficiais têm prioridade; a BrasilAPI é usada como contingência.
  for (const response of result) {
    if (response.status !== "fulfilled") continue;
    const municipio = encontrarMunicipio(response.value, cidade, uf);
    if (municipio) return { municipio, disponivel: true };
  }

  return {
    municipio: null,
    disponivel: result.some((response) => response.status === "fulfilled"),
  };
}
