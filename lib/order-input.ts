export function prepareOrderDetails(
  details: {
    problema: string;
    observacoes_estado: string;
    tecnico: string;
    previsao: string;
  },
  estado: string[],
) {
  const problema = details.problema.trim();
  if (Array.from(problema).length < 3 || Array.from(problema).length > 5000) {
    throw new Error(
      "Descreva o problema do aparelho com 3 a 5.000 caracteres, sem contar espaços no início e no fim. Exemplo: Não liga.",
    );
  }
  return {
    problema,
    estado,
    observacoes_estado: details.observacoes_estado.trim(),
    tecnico: details.tecnico.trim(),
    previsao: details.previsao || null,
  };
}
