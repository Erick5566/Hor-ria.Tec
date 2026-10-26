import { NextResponse } from "next/server";
import { getServerAccess } from "@/lib/server-auth";
import { resolverMunicipio, ufValida } from "@/lib/fiscal-municipio";

export async function GET(request: Request) {
  const access = await getServerAccess();
  const company = access?.context.company;
  if (!access || !company)
    return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const url = new URL(request.url);
  const uf = (url.searchParams.get("uf") || "").trim().toUpperCase();
  const cidade = (url.searchParams.get("cidade") || "").trim();

  if (!ufValida(uf) || cidade.length < 2 || cidade.length > 100)
    return NextResponse.json(
      { error: "Informe cidade e UF válidas." },
      { status: 400 },
    );

  const { municipio, disponivel } = await resolverMunicipio(cidade, uf);

  if (municipio) return NextResponse.json(municipio);

  if (!disponivel)
    return NextResponse.json(
      {
        code: "MUNICIPIO_LOOKUP_UNAVAILABLE",
        error: "Consulta automática temporariamente indisponível. Tente novamente ou informe o código IBGE oficial.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );

  return NextResponse.json(
    { error: "Município não encontrado. Confira cidade e UF." },
    { status: 404 },
  );
}
