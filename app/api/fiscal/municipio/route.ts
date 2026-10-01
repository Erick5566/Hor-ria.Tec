import { NextResponse } from "next/server";
import { getServerAccess } from "@/lib/server-auth";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export async function GET(request: Request) {
  const access = await getServerAccess();
  const company = access?.context.company;
  if (!access || !company)
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const url = new URL(request.url);
  const uf = (url.searchParams.get("uf") || "").trim().toUpperCase();
  const cidade = (url.searchParams.get("cidade") || "").trim();

  if (!/^[A-Z]{2}$/.test(uf) || cidade.length < 2)
    return NextResponse.json(
      { error: "Informe cidade e UF válidas." },
      { status: 400 },
    );

  try {
    const response = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`,
      {
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok)
      return NextResponse.json(
        { error: "Não foi possível consultar o município agora." },
        { status: 502 },
      );

    const municipalities = (await response.json()) as Array<{
      id: number;
      nome: string;
    }>;

    const wanted = normalize(cidade);
    const exact = municipalities.find((item) => normalize(item.nome) === wanted);
    const close =
      exact ||
      municipalities.find((item) => normalize(item.nome).startsWith(wanted)) ||
      municipalities.find((item) => wanted.startsWith(normalize(item.nome)));

    if (!close)
      return NextResponse.json(
        { error: "Município não encontrado. Confira cidade e UF." },
        { status: 404 },
      );

    return NextResponse.json({
      codigo: String(close.id),
      cidade: close.nome,
      uf,
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível consultar o município agora." },
      { status: 502 },
    );
  }
}
