import "server-only";
import { buildAiInstructions, type AiAudience, type ChatLine, type SafeCompanyProfile } from "@/lib/horaria-ai-core";

type OpenAiResponse = {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

/** Chamada cobrada. Nunca chamar sem reserva pré-paga concluída no servidor. */
export async function createPaidAiReply(args: {
  audience: AiAudience;
  prompt: string;
  history: ChatLine[];
  company?: SafeCompanyProfile;
}): Promise<string> {
  const key = process.env.HORARIA_OPENAI_API_KEY;
  if (!key || process.env.HORARIA_AI_PAID_ENABLED !== "true")
    throw new Error("Provedor de IA não habilitado");
  const messages = [
    ...args.history.map(m => ({
      role: m.role,
      content: m.content.slice(0, 700),
    })),
    { role: "user", content: args.prompt.slice(0, 900) },
  ];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const result = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-6-luna",
        reasoning: { effort: "none" },
        instructions: buildAiInstructions(args.audience, args.company),
        input: messages,
        max_output_tokens: 420,
        store: false,
      }),
    });
    if (!result.ok) throw new Error("Serviço de IA indisponível");
    const json = (await result.json()) as OpenAiResponse;
    const answer = (json.output || [])
      .flatMap(part => part.type === "message" ? part.content || [] : [])
      .filter(part => part.type === "output_text" && typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();
    if (!answer) throw new Error("Resposta de IA vazia");
    return answer.slice(0, 2500);
  } finally {
    clearTimeout(timeout);
  }
}
