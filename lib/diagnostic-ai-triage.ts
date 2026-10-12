// Triagem local gratuita. NÃO é um laudo nem análise de imagem por IA.
// Usada quando o provedor externo está desligado ou não há créditos.
export type DiagnosticHint = {
  heading: string;
  possibleCauses: string[];
  suggestedTests: string[];
  caveat: string;
};

type Rule = {
  needles: string[];
  heading: string;
  possibleCauses: string[];
  tests: string[];
};

const rules: Rule[] = [
  {
    needles: ["nao carrega", "carregamento", "sem carregar", "conector", "usb"],
    heading: "Suspeita de falha no carregamento",
    possibleCauses: [
      "Cabo, carregador ou fonte incompatível/defeituosa",
      "Sujeira, oxidação ou dano mecânico no conector",
      "Bateria, circuito de carga ou placa — somente após testes instrumentais",
    ],
    tests: [
      "Testar cabo e fonte conhecidos como bons",
      "Inspecionar conector com iluminação e aumento; não forçar pinos",
      "Verificar indicação de carga e consumo com equipamento apropriado",
    ],
  },
  {
    needles: ["nao liga", "apagado", "sem sinal", "nao inicia", "desliga sozinho"],
    heading: "Falha de inicialização ou alimentação",
    possibleCauses: [
      "Bateria descarregada ou degradada",
      "Botão de ligar, tela apagada ou falha de alimentação",
      "Defeito de placa ou software — não confirmável apenas por foto",
    ],
    tests: [
      "Verificar fonte compatível e sinais de funcionamento",
      "Inspecionar sinais de oxidação, aquecimento anormal e danos externos",
      "Diferenciar aparelho desligado de falha de tela",
    ],
  },
  {
    needles: ["tela", "display", "touch", "trinc", "quebrad", "imagem"],
    heading: "Danos na tela ou no conjunto frontal",
    possibleCauses: [
      "Vidro externo trincado ou conjunto de tela danificado",
      "Falha de touch, display ou conectores internos",
      "Avaria por impacto que também afete outros componentes",
    ],
    tests: [
      "Registrar foto de frente e das bordas",
      "Verificar brilho, toque e pontos sem resposta, quando seguro",
      "Testar imagem em diferentes condições e confirmar a extensão do dano",
    ],
  },
  {
    needles: ["molhou", "liquido", "oxid", "agua", "umidade"],
    heading: "Possível contato com líquido",
    possibleCauses: [
      "Entrada de líquido ou umidade por aberturas",
      "Corrosão em conectores ou componentes",
      "Curto ou falha de placa — necessita inspeção especializada",
    ],
    tests: [
      "Não energizar nem conectar carregador antes da avaliação",
      "Registrar sinais visíveis de corrosão e indicadores de líquido",
      "Inspecionar internamente somente por técnico qualificado",
    ],
  },
  {
    needles: ["bateria", "autonomia", "descarrega", "inchad", "esquenta"],
    heading: "Possível problema de bateria ou consumo",
    possibleCauses: [
      "Degradação da bateria",
      "Consumo excessivo por aplicativo, componente ou circuito",
      "Bateria estufada, especialmente se há deformação visível",
    ],
    tests: [
      "Verificar integridade física antes de manusear ou carregar",
      "Consultar saúde da bateria e histórico de consumo, se disponível",
      "Se houver inchaço, interromper carga e encaminhar para procedimento seguro",
    ],
  },
  {
    needles: ["trav", "lento", "software", "atualiz", "reinicia"],
    heading: "Possível instabilidade de software",
    possibleCauses: [
      "Armazenamento insuficiente, sistema ou aplicativos com falhas",
      "Atualização incompleta",
      "Problema de hardware que exige testes adicionais",
    ],
    tests: [
      "Confirmar sintoma e frequência de reinicializações",
      "Verificar armazenamento e mensagens de erro sem acessar dados privados",
      "Solicitar autorização antes de qualquer restauração ou procedimento com perda de dados",
    ],
  },
];

export function normalizeSymptom(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function suggestDiagnosis(symptoms: string): DiagnosticHint {
  const text = normalizeSymptom(symptoms);
  let best: Rule | null = null;
  let score = 0;
  for (const rule of rules) {
    const count = rule.needles.filter(needle => text.includes(needle)).length;
    if (count > score) { best = rule; score = count; }
  }
  return {
    heading: best?.heading || "Triagem inicial do equipamento",
    possibleCauses: best?.possibleCauses || [
      "O relato ainda não aponta uma causa específica",
      "Pode ser necessário obter mais detalhes do defeito e do histórico",
    ],
    suggestedTests: best?.tests || [
      "Confirmar o defeito relatado com o cliente",
      "Registrar fotos externas e condições de entrada",
      "Realizar checklist funcional de tela, toque, áudio, câmeras, bateria e conectores",
    ],
    caveat: "Sugestões automáticas baseadas no relato, não um diagnóstico confirmado. O técnico deve executar testes reais e aprovar o registro antes de salvar ou enviar orçamento.",
  };
}
export function diagnosticDraft(hint: DiagnosticHint) {
  return [
    "Triagem sugerida (não confirmada pelo técnico): " + hint.heading,
    "Possíveis causas a investigar: " + hint.possibleCauses.join("; ") + ".",
    "Testes recomendados: " + hint.suggestedTests.join("; ") + ".",
    "Aguardando conferência do técnico.",
  ].join("\n");
}
