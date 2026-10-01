import { NextResponse } from "next/server";
import { getServerAccess } from "@/lib/server-auth";

type FiscalSettings = {
  empresa_id: string;
  ambiente: "homologacao" | "producao";
  ativo: boolean;
  cnpj: string | null;
  codigo_municipio: string | null;
  codigo_tributacao_nacional_iss: string | null;
  codigo_opcao_simples_nacional: string | null;
  regime_especial_tributacao: string | null;
  tributacao_iss: number | string | null;
  serie_dps: number;
};

type FiscalDocument = {
  id: string;
  empresa_id: string;
  provider_ref: string;
  ambiente: "homologacao" | "producao";
};

type ProviderResult = Record<string, unknown>;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function providerBase(environment: "homologacao" | "producao") {
  return environment === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function providerToken(environment: "homologacao" | "producao") {
  return environment === "producao"
    ? process.env.FOCUS_NFE_TOKEN_PRODUCAO
    : process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO;
}

function localIssueTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return {
    timestamp: `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}-03:00`,
    date: `${map.year}-${map.month}-${map.day}`,
  };
}

function normalizeStatus(value: unknown) {
  const status = String(value ?? "").toLowerCase();
  if (status === "autorizado") return "autorizado";
  if (status === "cancelado") return "cancelado";
  if (["erro_autorizacao", "erro", "rejeitado", "denegado"].includes(status))
    return "erro_autorizacao";
  return "processando_autorizacao";
}

function fileUrl(base: string, value: unknown) {
  const path = typeof value === "string" ? value : "";
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return base + (path.startsWith("/") ? path : "/" + path);
}

function responseMessage(payload: ProviderResult) {
  const value =
    payload.mensagem_sefaz ??
    payload.mensagem ??
    payload.message ??
    payload.erros ??
    payload.status;
  if (typeof value === "string") return value.slice(0, 1000);
  if (Array.isArray(value))
    return value
      .map((item) =>
        typeof item === "string" ? item : JSON.stringify(item),
      )
      .join(" · ")
      .slice(0, 1000);
  return value ? JSON.stringify(value).slice(0, 1000) : "";
}

async function parseProviderResponse(response: Response) {
  const text = await response.text();
  if (!text) return {} as ProviderResult;
  try {
    return JSON.parse(text) as ProviderResult;
  } catch {
    return { message: text.slice(0, 1000) } as ProviderResult;
  }
}

async function requireManager() {
  const access = await getServerAccess();
  const company = access?.context.company;
  if (!access || !company)
    return { error: "Sessão inválida.", status: 401 } as const;
  if (!["OWNER", "ADMIN"].includes(company.role))
    return {
      error: "Apenas proprietário ou administrador pode emitir notas fiscais.",
      status: 403,
    } as const;
  return { access, company } as const;
}

export async function GET() {
  const auth = await requireManager();
  if ("error" in auth)
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );

  return NextResponse.json({
    provider: "focusnfe",
    homologacaoConfigured: Boolean(process.env.FOCUS_NFE_TOKEN_HOMOLOGACAO),
    producaoConfigured: Boolean(process.env.FOCUS_NFE_TOKEN_PRODUCAO),
  });
}

export async function POST(request: Request) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: "Origem inválida." }, { status: 403 });

  const auth = await requireManager();
  if ("error" in auth)
    return NextResponse.json(
      { error: auth.error },
      { status: auth.status },
    );

  const body = (await request.json().catch(() => null)) as
    | {
        action?: "issue" | "refresh";
        orderId?: string;
        documentId?: string;
      }
    | null;

  if (!body)
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const { client } = auth.access;
  const companyId = auth.company.id;

  if (body.action === "refresh") {
    if (!body.documentId)
      return NextResponse.json(
        { error: "Documento fiscal não informado." },
        { status: 400 },
      );

    const documentResult = await client
      .from("fiscal_documents")
      .select("id,empresa_id,provider_ref,ambiente")
      .eq("id", body.documentId)
      .eq("empresa_id", companyId)
      .maybeSingle();

    if (documentResult.error)
      return NextResponse.json(
        { error: documentResult.error.message },
        { status: 400 },
      );
    if (!documentResult.data)
      return NextResponse.json(
        { error: "Documento fiscal não encontrado." },
        { status: 404 },
      );

    const document = documentResult.data as FiscalDocument;
    const token = providerToken(document.ambiente);
    if (!token)
      return NextResponse.json(
        {
          error:
            document.ambiente === "producao"
              ? "Token de produção da Focus NFe ainda não foi configurado."
              : "Token de homologação da Focus NFe ainda não foi configurado.",
        },
        { status: 503 },
      );

    const base = providerBase(document.ambiente);
    const providerResponse = await fetch(
      `${base}/v2/nfsen/${encodeURIComponent(document.provider_ref)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(token + ":").toString("base64")}`,
        },
        cache: "no-store",
      },
    );

    const payload = await parseProviderResponse(providerResponse);
    if (!providerResponse.ok)
      return NextResponse.json(
        {
          error:
            responseMessage(payload) ||
            "Não foi possível consultar a NFS-e na Focus NFe.",
        },
        { status: providerResponse.status >= 500 ? 502 : 400 },
      );

    const status = normalizeStatus(payload.status);
    const update = {
      status,
      numero:
        typeof payload.numero === "string"
          ? payload.numero
          : typeof payload.numero_nfse === "string"
            ? payload.numero_nfse
            : null,
      chave:
        typeof payload.chave_nfse === "string"
          ? payload.chave_nfse
          : typeof payload.chave === "string"
            ? payload.chave
            : null,
      protocolo:
        typeof payload.protocolo === "string" ? payload.protocolo : null,
      pdf_url: fileUrl(
        base,
        payload.caminho_pdf ??
          payload.caminho_danfse ??
          payload.caminho_danfe,
      ),
      xml_url: fileUrl(
        base,
        payload.caminho_xml ??
          payload.caminho_xml_nfse ??
          payload.caminho_xml_nota_fiscal,
      ),
      mensagem: responseMessage(payload) || null,
      provider_response: payload,
      atualizado_em: new Date().toISOString(),
    };

    const saved = await client
      .from("fiscal_documents")
      .update(update)
      .eq("id", document.id)
      .eq("empresa_id", companyId)
      .select("*")
      .single();

    if (saved.error)
      return NextResponse.json({ error: saved.error.message }, { status: 400 });

    return NextResponse.json({ document: saved.data });
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
      { error: "Finalize a configuração fiscal antes de emitir." },
      { status: 400 },
    );

  const settings = settingsResult.data as FiscalSettings;
  if (!settings.ativo)
    return NextResponse.json(
      { error: "Ative a emissão fiscal nas configurações." },
      { status: 400 },
    );

  const cnpj = digits(settings.cnpj);
  const municipalityCode = String(settings.codigo_municipio ?? "").trim();
  const serviceTaxCode = String(
    settings.codigo_tributacao_nacional_iss ?? "",
  ).trim();
  const simpleCode = String(
    settings.codigo_opcao_simples_nacional ?? "",
  ).trim();
  const issTaxation = Number(settings.tributacao_iss);

  if (
    cnpj.length !== 14 ||
    !/^\d{7}$/.test(municipalityCode) ||
    !serviceTaxCode ||
    !simpleCode ||
    !Number.isFinite(issTaxation)
  )
    return NextResponse.json(
      {
        error:
          "Complete CNPJ, município IBGE, código nacional do serviço, opção do Simples e tributação do ISS.",
      },
      { status: 400 },
    );

  const token = providerToken(settings.ambiente);
  if (!token)
    return NextResponse.json(
      {
        error:
          settings.ambiente === "producao"
            ? "Token de produção da Focus NFe ainda não foi configurado."
            : "Token de homologação da Focus NFe ainda não foi configurado.",
      },
      { status: 503 },
    );

  const activeDocument = await client
    .from("fiscal_documents")
    .select("id,status")
    .eq("empresa_id", companyId)
    .eq("ordem_id", body.orderId)
    .in("status", ["preparando", "processando_autorizacao", "autorizado"])
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeDocument.error)
    return NextResponse.json(
      { error: activeDocument.error.message },
      { status: 400 },
    );
  if (activeDocument.data)
    return NextResponse.json(
      {
        error:
          activeDocument.data.status === "autorizado"
            ? "Esta OS já possui uma NFS-e autorizada."
            : "Já existe uma emissão desta OS em processamento.",
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
      { error: "Finalize a OS antes de emitir a NFS-e." },
      { status: 400 },
    );

  const [clientResult, quoteResult] = await Promise.all([
    client
      .from("clientes")
      .select("id,nome,documento,email")
      .eq("id", orderResult.data.cliente_id)
      .eq("empresa_id", companyId)
      .maybeSingle(),
    client
      .from("orcamentos")
      .select("id,total,versao,status")
      .eq("ordem_id", orderResult.data.id)
      .eq("empresa_id", companyId)
      .eq("status", "aprovado")
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (clientResult.error || quoteResult.error)
    return NextResponse.json(
      {
        error:
          clientResult.error?.message ||
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

  const reservedNumber = await client.rpc("reservar_numero_dps", {
    p_empresa: companyId,
  });
  if (reservedNumber.error)
    return NextResponse.json(
      { error: reservedNumber.error.message },
      { status: 400 },
    );

  const documentId = crypto.randomUUID();
  const providerRef = `horaria-${documentId}`;
  const amount = Number(quoteResult.data.total);

  const created = await client
    .from("fiscal_documents")
    .insert({
      id: documentId,
      empresa_id: companyId,
      ordem_id: orderResult.data.id,
      tipo: "nfsen",
      ambiente: settings.ambiente,
      provider: "focusnfe",
      provider_ref: providerRef,
      numero_dps: Number(reservedNumber.data),
      serie_dps: settings.serie_dps,
      status: "preparando",
      valor: amount,
    })
    .select("*")
    .single();

  if (created.error)
    return NextResponse.json({ error: created.error.message }, { status: 400 });

  const issueTime = localIssueTime();
  const customerDocument = digits(clientResult.data?.documento);
  const payload: Record<string, unknown> = {
    data_emissao: issueTime.timestamp,
    data_competencia: issueTime.date,
    serie_dps: settings.serie_dps,
    numero_dps: Number(reservedNumber.data),
    emitente_dps: "1",
    codigo_municipio_emissora: Number(municipalityCode),
    cnpj_prestador: cnpj,
    codigo_opcao_simples_nacional: simpleCode,
    codigo_municipio_prestacao: municipalityCode,
    codigo_tributacao_nacional_iss: serviceTaxCode,
    descricao_servico: `Serviços de assistência técnica referentes à OS #${orderResult.data.numero}.`,
    valor_servico: amount,
    tributacao_iss: issTaxation,
  };

  if (settings.regime_especial_tributacao)
    payload.regime_especial_tributacao =
      settings.regime_especial_tributacao;
  if (customerDocument.length === 11) payload.cpf_tomador = customerDocument;
  if (customerDocument.length === 14) payload.cnpj_tomador = customerDocument;

  const base = providerBase(settings.ambiente);
  let providerResponse: Response;
  let providerPayload: ProviderResult;

  try {
    providerResponse = await fetch(
      `${base}/v2/nfsen?ref=${encodeURIComponent(providerRef)}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(token + ":").toString("base64")}`,
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );
    providerPayload = await parseProviderResponse(providerResponse);
  } catch {
    await client
      .from("fiscal_documents")
      .update({
        status: "erro_autorizacao",
        mensagem: "Falha de comunicação com o emissor fiscal.",
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", documentId)
      .eq("empresa_id", companyId);

    return NextResponse.json(
      { error: "Não foi possível conectar ao emissor fiscal." },
      { status: 502 },
    );
  }

  const normalized = normalizeStatus(providerPayload.status);
  const finalStatus = providerResponse.ok ? normalized : "erro_autorizacao";
  const update = {
    status: finalStatus,
    numero:
      typeof providerPayload.numero === "string"
        ? providerPayload.numero
        : typeof providerPayload.numero_nfse === "string"
          ? providerPayload.numero_nfse
          : null,
    chave:
      typeof providerPayload.chave_nfse === "string"
        ? providerPayload.chave_nfse
        : typeof providerPayload.chave === "string"
          ? providerPayload.chave
          : null,
    protocolo:
      typeof providerPayload.protocolo === "string"
        ? providerPayload.protocolo
        : null,
    pdf_url: fileUrl(
      base,
      providerPayload.caminho_pdf ??
        providerPayload.caminho_danfse ??
        providerPayload.caminho_danfe,
    ),
    xml_url: fileUrl(
      base,
      providerPayload.caminho_xml ??
        providerPayload.caminho_xml_nfse ??
        providerPayload.caminho_xml_nota_fiscal,
    ),
    mensagem: responseMessage(providerPayload) || null,
    provider_response: providerPayload,
    atualizado_em: new Date().toISOString(),
  };

  const saved = await client
    .from("fiscal_documents")
    .update(update)
    .eq("id", documentId)
    .eq("empresa_id", companyId)
    .select("*")
    .single();

  if (!providerResponse.ok)
    return NextResponse.json(
      {
        error:
          responseMessage(providerPayload) ||
          "O emissor fiscal recusou a solicitação.",
        document: saved.data ?? created.data,
      },
      { status: providerResponse.status >= 500 ? 502 : 400 },
    );

  if (saved.error)
    return NextResponse.json({ error: saved.error.message }, { status: 400 });

  return NextResponse.json({ document: saved.data }, { status: 201 });
}
