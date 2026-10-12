import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import vm from "node:vm";

function importTriage() {
  const exports={};
  const source=readFileSync("lib/diagnostic-ai-triage.ts","utf8");
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports});
  return exports;
}
test("Triagem de texto é gratuita, plausível e recomenda testes sem confirmar o reparo",()=>{
  const t=importTriage();
  for(const [symptom,expected] of [
    ["iPhone não carrega","carregamento"],
    ["O aparelho não liga","inicializacao"],
    ["Display e tela quebrada","tela"],
    ["Molhou com água","liquido"],
    ["Bateria inchada","bateria"],
    ["Software travando","software"],
  ]) {
    const suggestion=t.suggestDiagnosis(symptom);
    assert.match(t.normalizeSymptom(suggestion.heading),new RegExp(expected));
    assert.ok(suggestion.suggestedTests.length>=2);
    assert.ok(suggestion.possibleCauses.length>=2);
    assert.match(t.diagnosticDraft(suggestion),/não confirmada|não confirmadas/);
  }
  assert.match(t.suggestDiagnosis("pouco detalhado").caveat,/técnico/);
});

test("Assistente não altera diagnóstico nem fotos sem consentimento do técnico",()=>{
  const view=readFileSync("components/diagnosis-ai-assistant.tsx","utf8");
  const diagnosis=readFileSync("components/diagnosis.tsx","utf8");
  const provider=readFileSync("lib/diagnosis-vision-provider.ts","utf8");
  assert.match(view,/setConsent\(false\)/);
  assert.match(view,/consent:true/);
  assert.match(view,/onApplyDraft\(/);
  assert.match(view,/type="button"/);
  assert.match(diagnosis,/<DiagnosisAiAssistant/);
  assert.match(diagnosis,/setObservations\(\(current\)/);
  assert.doesNotMatch(view,/\.from\("diagnosticos"\)\.upsert/);
  assert.match(provider,/store:false/);
  assert.match(provider,/input_image/);
  assert.match(provider,/detail:"low"/);
  assert.match(provider,/max_output_tokens:650/);
});
