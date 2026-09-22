import { NextResponse } from "next/server";

type ViaCepResponse = {
  erro?: boolean | string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cep: string }> },
) {
  const { cep: rawCep } = await params;
  const cep = rawCep.replace(/\D/g, "");

  if (!/^\d{8}$/.test(cep)) {
    return NextResponse.json({ found: false }, { status: 200 });
  }

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ found: false }, { status: 200 });
    }

    const data = (await response.json()) as ViaCepResponse;
    if (data.erro === true || data.erro === "true") {
      return NextResponse.json({ found: false }, { status: 200 });
    }

    return NextResponse.json({
      found: true,
      logradouro: data.logradouro || "",
      bairro: data.bairro || "",
      cidade: data.localidade || "",
      estado: data.uf || "",
    });
  } catch {
    return NextResponse.json({ found: false }, { status: 200 });
  }
}
