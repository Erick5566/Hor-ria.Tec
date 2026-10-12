import "server-only";
import { buildAiInstructions } from "@/lib/horaria-ai-core";

type ImageInput = { bytes: Buffer; mime: "image/jpeg" | "image/png" | "image/webp"; category: string };
type OpenAiResponse = {
  output?: Array<{type?:string;content?:Array<{type?:string;text?:string}>}>;
};

/** Análise visual paga: exige reserva pré-paga validada ANTES desta função. */
export async function analyzeRepairPhotos(args: {
  symptoms: string;
  device: string;
  images: ImageInput[];
}): Promise<string> {
  const key = process.env.HORARIA_OPENAI_API_KEY;
  if (process.env.HORARIA_AI_PAID_ENABLED !== "true" || !key)
    throw new Error("Análise visual com IA ainda não ativada");
  if (!args.images.length || args.images.length > 2)
    throw new Error("Selecione uma ou duas fotos");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const content: Array<Record<string, unknown>> = [{
      type:"input_text",
      text: [
        "Avalie SOMENTE sinais externos visíveis, não diagnostique componentes internos sem teste.",
        "Equipamento: " + args.device.slice(0, 120),
        "Relato: " + args.symptoms.slice(0, 650),
        "Entregue resposta em português com quatro seções:",
        "1. SINAIS VISÍVEIS: o que efetivamente aparece, indicando quando não é possível avaliar.",
        "2. HIPÓTESES (NÃO CONFIRMADAS): possibilidades plausíveis sem presumir defeito interno.",
        "3. TESTES RECOMENDADOS: testes técnicos seguros antes de um orçamento.",
        "4. LIMITAÇÕES: qualidade da foto, impossibilidade de garantir causa, necessidade de inspeção presencial.",
        "Não invente números, peças, custos, reparos realizados, medições ou testes que não foram feitos.",
        "Não declare que não há dano só porque ele não é visível.",
        "Sinais de bateria estufada ou líquido: recomende isolamento e não energizar até inspeção segura.",
      ].join("\n"),
    }];
    for (const photo of args.images) {
      content.push({
        type: "input_text",
        text: "Foto de referência: " + photo.category.slice(0, 45),
      });
      content.push({
        type:"input_image",
        image_url: "data:" + photo.mime + ";base64," + photo.bytes.toString("base64"),
        detail:"low",
      });
    }
    const response = await fetch("https://api.openai.com/v1/responses", {
      method:"POST",
      cache:"no-store",
      signal:controller.signal,
      headers:{
        Authorization:"Bearer " + key,
        "Content-Type":"application/json",
      },
      body:JSON.stringify({
        model:"gpt-6-luna",
        reasoning:{effort:"none"},
        instructions:buildAiInstructions("horaria-support") +
          "\nVocê ajuda o técnico na triagem de reparos, não atende pacientes nem faz diagnóstico médico.",
        input:[{role:"user",content}],
        max_output_tokens:650,
        store:false,
      }),
    });
    if (!response.ok) throw new Error("A análise visual não está disponível.");
    const result = await response.json() as OpenAiResponse;
    const text = (result.output || [])
      .flatMap(part => part.type==="message" ? part.content || [] : [])
      .filter(x => x.type==="output_text" && typeof x.text==="string")
      .map(x => x.text).join("\n").trim();
    if (!text) throw new Error("A análise não retornou observações.");
    return text.slice(0, 4500);
  } finally { clearTimeout(timeout); }
}
