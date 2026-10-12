import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerAccess } from "@/lib/server-auth";
import { analyzeRepairPhotos } from "@/lib/diagnosis-vision-provider";

export const runtime = "nodejs";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedMime = new Set(["image/jpeg", "image/png", "image/webp"]);
function json(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return json({error:"Origem inválida"},403);
  if (Number(request.headers.get("content-length") || 0)>2500)
    return json({error:"Solicitação muito longa"},413);
  const access = await getServerAccess();
  const company = access?.context.company;
  if (!access?.user?.id || !company) return json({error:"Entre na Horária."},401);
  if (!["OWNER","ADMIN","TECHNICIAN"].includes(company.role))
    return json({error:"Somente técnicos ou gestores podem analisar fotos."},403);
  if (access.context.globalMaintenance || company.maintenance ||
      !["TRIAL","ACTIVE"].includes(company.status))
    return json({error:"Assistência sem acesso ao diagnóstico."},403);

  let body: Record<string,unknown> | null = null;
  try {
    const raw = await request.text();
    if (raw.length>2500) return json({error:"Solicitação muito longa"},413);
    const value:unknown = JSON.parse(raw);
    if (value !== null && typeof value === "object" && !Array.isArray(value)) body=value as Record<string,unknown>;
  } catch {return json({error:"Pedido inválido"},400);}
  if (!body || body.consent !== true ||
      typeof body.ordemId !== "string" || !uuid.test(body.ordemId) ||
      !Array.isArray(body.photoIds) || body.photoIds.length<1 || body.photoIds.length>2 ||
      new Set(body.photoIds).size !== body.photoIds.length ||
      body.photoIds.some(id => typeof id!=="string" || !uuid.test(id)) ||
      (body.notes !== undefined &&
       (typeof body.notes !== "string" || body.notes.length>650)))
    return json({error:"Selecione até duas fotos e autorize expressamente a análise externa."},400);

  // Nunca buscar foto por caminho fornecido pelo navegador: somente por id, OS e empresa.
  const order = await access.client.from("ordens_servico")
    .select("id,empresa_id,problema,equipamento_id")
    .eq("id",body.ordemId).eq("empresa_id",company.id).maybeSingle();
  if (order.error || !order.data) return json({error:"OS não encontrada ou sem autorização."},404);
  const photoIds = body.photoIds as string[];
  const result = await access.client.from("fotos_os")
    .select("id,caminho,categoria,descricao")
    .eq("empresa_id",company.id)
    .eq("ordem_id",body.ordemId)
    .in("id",photoIds);
  if (result.error || !result.data || result.data.length !== photoIds.length)
    return json({error:"As fotos precisam pertencer a esta OS."},403);

  // Bloqueio de custo ANTES de fazer download, reservar unidades ou acessar a API.
  if (!company.featureFlags.aiEnabled)
    return json({error:"Análise visual com IA não habilitada para esta assistência.",code:"AI_DISABLED"},403);
  if (process.env.HORARIA_AI_PAID_ENABLED !== "true" || !process.env.HORARIA_OPENAI_API_KEY)
    return json({error:"Análise visual aguardando ativação. Nenhum crédito foi consumido.",code:"AI_OFF"},503);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey)
    return json({error:"Carteira indisponível. Nenhuma análise foi cobrada.",code:"CREDITS_OFF"},503);

  const photos = [];
  let totalBytes = 0;
  for (const id of photoIds) {
    const photo = result.data.find(item=>item.id===id);
    if (!photo || !photo.caminho.startsWith(company.id+"/"+body.ordemId+"/"))
      return json({error:"Caminho de foto inválido."},403);
    const downloaded = await access.client.storage.from("os-fotos").download(photo.caminho);
    if (downloaded.error || !downloaded.data)
      return json({error:"Não foi possível ler uma das fotos privadas."},422);
    const blob=downloaded.data;
    const mime=blob.type.split(";")[0].toLowerCase();
    if (!allowedMime.has(mime) || blob.size>6*1024*1024 || blob.size<256)
      return json({error:"A análise aceita fotos JPEG, PNG ou WebP de até 6 MB."},422);
    totalBytes+=blob.size;
    if(totalBytes>8*1024*1024)
      return json({error:"Envie até 8 MB no total de fotos para análise."},422);
    photos.push({
      bytes:Buffer.from(await blob.arrayBuffer()),
      mime:mime as "image/jpeg" | "image/png" | "image/webp",
      category:photo.categoria,
    });
  }

  const service=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const reserved=await service.rpc("ai_reserve_message",{
    p_empresa:company.id,p_actor:access.user.id,p_channel:"web",
  });
  if (reserved.error || typeof reserved.data!=="string")
    return json({error:"Você precisa de créditos pré-pagos para analisar fotos. Nenhuma chamada paga foi feita.",code:"CREDIT_REQUIRED"},402);

  let settled=false;
  try {
    // Não transmitir cliente, IMEI, contatos, senha ou dados financeiros à IA.
    const reply=await analyzeRepairPhotos({
      symptoms:[String(order.data.problema||"").slice(0,500),String(body.notes||"").slice(0,150)].join("\n"),
      device:"Equipamento desta ordem de serviço",
      images:photos,
    });
    const confirmation=await service.rpc("ai_finalize_message",{
      p_reservation:reserved.data,p_success:true,
    });
    if (confirmation.error || confirmation.data!==true)
      return json({error:"Falha ao confirmar análise. Solicite conferência dos créditos.",code:"SETTLEMENT_ERROR"},503);
    settled=true;
    return json({analysis:reply,creditUnits:1,requiresTechnicianReview:true});
  } catch {
    return json({error:"A análise visual não respondeu. Verifique os créditos ou tente mais tarde.",code:"VISION_ERROR"},503);
  } finally {
    if (!settled) {
      try {
        await service.rpc("ai_finalize_message",{p_reservation:reserved.data,p_success:false});
      } catch { /* o processo de conciliação deve recuperar a reserva pendente */ }
    }
  }
}
