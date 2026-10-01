import { NextResponse } from "next/server";
import { getServerAccess } from "@/lib/server-auth";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

async function requireManager() {
  const access = await getServerAccess();
  const company = access?.context.company;
  if (!access || !company)
    return { error: "Sessão inválida.", status: 401 } as const;
  if (!["OWNER", "ADMIN"].includes(company.role))
    return {
      error: "Apenas proprietário ou administrador pode preparar notas fiscais.",
      status: 403,
    } as const;
  return { access, company } as const;
}

export async function GET() {
  const auth = await requireManager();
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json({
    mode: "emissor_nacional_web",
    productionUrl: "https://www.nfse.gov.br/EmissorNacional/Login",
    restrictedUrl:
      "https://www.producaorestrita.nfse.gov.br/EmissorNacional/",
  });
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });

  const auth = await requireManager();
  if ("error" in auth)
    return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await request.json().catch(() => null)) as
    | {
        action?: "prepare" | "mark-issued";
        orderId?: string;
        documentId?: string;
        numero?: string;
        chave?: string;
      }
    | null;

  if (!body)
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const { client } = auth.access;
  const companyId = auth.company.id;

  if (body.action === "mark-issued") {
    if (!body.documentId || !body.numero?.trim())
      return NextResponse.json(
        { error: "Informe o número da NFS-e emitida." },
        { status: 400 },
      );

    const update = await client
      .from("fiscal_documents")
      .update({
        status: "emitida_manual",
        numero: body.numero.trim().slice(0, 80),
        chave: body.chave?.trim().slice(0, 160) || null,
        mensagem:
          "Emissão registrada após conclusão no Emissor Nacional da NFS-e.",
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", body.documentId)
      .eq("empresa_id", companyId)
      .eq("provider", "emissor_nacional_web")
      .select("*")
      .maybeSingle();

    if (update.error)
      return NextResponse.json({ error: update.error.message }, { status: 400 });
    if (!update.data)
      return NextResponse.json(
        { error: "Documento fiscal não encontrado." },
        { status: 404 },
      );

    return NextResponse.json({ document: update.data });
  }

  if (!body.orderId)
    return NextResponse.json(
      { error: "Selecione uma ordem de serviço." },
      { status: 400 },
    );

  const settingsResult = await client
    .from("fiscal_settings")
    .select("*")
    .eq("empresa_id", companyId)
    .maybeSingle();

  if (settingsResult.error)
    return NextResponse.json(
      { error: settingsResult.error.message },
      { status: 400 },
    );

  if (!settingsResult.data)
    return NextResponse.json(
      { error: "Salve os dados fiscais antes de preparar a emissão." },
      { status: 400 },
    );

  const cnpj = digits(settingsResult.data.cnpj);
  if (
    cnpj.length !== 14 ||
    !String(settingsResult.data.razao_social ?? "").trim() ||
    !/^\d{7}$/.test(String(settingsResult.data.codigo_municipio ?? ""))
  )
    return NextResponse.json(
      {
        error:
          "Complete pelo menos CNPJ, razão social e código IBGE do município.",
      },
      { status: 400 },
    );

  const existingResult = await client
    .from("fiscal_documents")
    .select("id,status")
    .eq("empresa_id", companyId)
    .eq("ordem_id", body.orderId)
    .in("status", [
      "preparando",
      "pronto_para_emitir",
      "emitida_manual",
      "processando_autorizacao",
      "autorizado",
    ])
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingResult.error)
    return NextResponse.json(
      { error: existingResult.error.message },
      { status: 400 },
    );
  if (existingResult.data)
    return NextResponse.json(
      {
        error:
          existingResult.data.status === "emitida_manual" ||
          existingResult.data.status === "autorizado"
            ? "Esta OS já possui uma NFS-e registrada."
            : "Já existe uma preparação fiscal aberta para esta OS.",
      },
      { status: 409 },
    );

  const orderResult = await client
    .from("ordens_servico")
    .select("id,numero,empresa_id,cliente_id,status,problema")
    .eq("id", body.orderId)
    .eq("empresa_id", companyId)
    .maybeSingle();

  if (orderResult.error)
    return NextResponse.json({ error: orderResult.error.message }, { status: 400 });
  if (!orderResult.data)
    return NextResponse.json(
      { error: "Ordem de serviço não encontrada." },
      { status: 404 },
    );
  if (orderResult.data.status !== "finalizado")
    return NextResponse.json(
      { error: "Finalize a OS antes de preparar a nota fiscal." },
      { status: 400 },
    );

  const [customerResult, quoteResult] = await Promise.all([
    client
      .from("clientes")
      .select("id,nome,documento,email")
      .eq("id", orderResult.data.cliente_id)
      .eq("empresa_id", companyId)
      .maybeSingle(),
    client
      .from("orcamentos")
      .select("id,total,versao,status,servicos,pecas,mao_obra,desconto")
      .eq("ordem_id", orderResult.data.id)
      .eq("empresa_id", companyId)
      .eq("status", "aprovado")
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (customerResult.error || quoteResult.error)
    return NextResponse.json(
      {
        error:
          customerResult.error?.message ||
          quoteResult.error?.message ||
          "Não foi possível carregar os dados da OS.",
      },
      { status: 400 },
    );

  if (!quoteResult.data || Number(quoteResult.data.total) <= 0)
    return NextResponse.json(
      { error: "A OS precisa ter um orçamento aprovado com valor maior que zero." },
      { status: 400 },
    );

  const documentId = crypto.randomUUID();
  const providerRef = `manual-${documentId}`;
  const created = await client
    .from("fiscal_documents")
    .insert({
      id: documentId,
      empresa_id: companyId,
      ordem_id: orderResult.data.id,
      tipo: "nfsen",
      ambiente: settingsResult.data.ambiente || "producao",
      provider: "emissor_nacional_web",
      provider_ref: providerRef,
      status: "pronto_para_emitir",
      valor: Number(quoteResult.data.total),
      mensagem:
        "Dados preparados pelo Horária. Conclua a emissão no Emissor Nacional.",
      provider_response: {
        mode: "assisted",
        order_number: orderResult.data.numero,
        customer_name: customerResult.data?.nome || "",
        customer_document: digits(customerResult.data?.documento),
        customer_email: customerResult.data?.email || "",
        problem: orderResult.data.problema,
        approved_quote: quoteResult.data,
      },
    })
    .select("*")
    .single();

  if (created.error)
    return NextResponse.json({ error: created.error.message }, { status: 400 });

  return NextResponse.json(
    {
      document: created.data,
      productionUrl: "https://www.nfse.gov.br/EmissorNacional/Login",
      restrictedUrl:
        "https://www.producaorestrita.nfse.gov.br/EmissorNacional/",
    },
    { status: 201 },
  );
}
