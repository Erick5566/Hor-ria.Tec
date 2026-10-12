import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function loadEntitlements(){
 const exports={};
 const src=readFileSync("lib/horaria-ai-entitlements.ts","utf8");
 const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{exports});
 return exports;
}

test("IA Plus: apenas assinatura real HORARIA_PRO, não feature flag, concede acesso",()=>{
 const {isHorariaPlus,canRunPaidAi}=loadEntitlements();
 for(const code of [undefined,null,"","HORARIA","Horária","BASIC","PLUS","HORARIA_PRO_BASICO"])
   assert.equal(isHorariaPlus(code),false);
 assert.equal(isHorariaPlus("HORARIA_PRO"),true);
 assert.equal(canRunPaidAi("HORARIA",true),false);
 assert.equal(canRunPaidAi("HORARIA_PRO",false),false);
 assert.equal(canRunPaidAi("HORARIA_PRO",true),true);
});

test("IA Plus: recebimento oferece assistência automática na etapa do defeito sem cobrar API",()=>{
 const order=readFileSync("components/order-form.tsx","utf8");
 const coach=readFileSync("components/order-ai-intake-coach.tsx","utf8");
 const css=readFileSync("app/ai-plus-context.css","utf8");
 assert.match(order,/isHorariaPlus\(access\.billing\?\.planCode\)/);
 assert.match(order,/<OrderAiIntakeCoach/);
 assert.match(order,/symptom=\{details\.problema\}/);
 assert.match(coach,/suggestDiagnosis\(symptom\)/);
 assert.match(coach,/const ready=symptom\.trim\(\)\.length>=3/);
 assert.match(coach,/Copiar plano de testes/);
 assert.doesNotMatch(coach,/fetch\(|createPaidAiReply|OPENAI_API_KEY|supabase\.rpc/);
 assert.match(css,/@media\(max-width:640px\)/);
 assert.match(css,/\.ai-intake-coach/);
});

test("IA Plus: Básico não renderiza IA em Ajuda nem na aba Diagnóstico",()=>{
 const help=readFileSync("components/admin-module.tsx","utf8");
 const diagnosis=readFileSync("components/diagnosis.tsx","utf8");
 const aid=readFileSync("components/diagnosis-ai-assistant.tsx","utf8");
 assert.match(help,/isHorariaPlus\(access\.billing\?\.planCode\) && <HorariaAiChat/);
 assert.match(diagnosis,/isHorariaPlus\(access\.billing\?\.planCode\) && <DiagnosisAiAssistant/);
 assert.match(aid,/enabled && <details/);
 assert.match(aid,/guidanceReady/);
 assert.match(aid,/const guidanceReady=/);
});

test("IA Plus: rotas pagas validam assinatura no servidor antes de acessar créditos e fotos",()=>{
 const chat=readFileSync("app/api/ai/chat/route.ts","utf8");
 const vision=readFileSync("app/api/ai/diagnosis/route.ts","utf8");
 assert.match(chat,/isHorariaPlus\(access\.context\.billing\?\.planCode\)/);
 assert.match(vision,/isHorariaPlus\(access\.context\.billing\?\.planCode\)/);
 assert.ok(vision.indexOf("isHorariaPlus(access.context.billing?.planCode)")<vision.indexOf('from("ordens_servico")'));
 assert.ok(chat.indexOf("isHorariaPlus(access.context.billing?.planCode)")<chat.indexOf('if (body.mode === "support")'));
});
