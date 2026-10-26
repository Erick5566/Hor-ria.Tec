/**
 * Mensagens para falhas do widget Turnstile.
 * Nunca ignora a validação ou gera tokens substitutos.
 */
export function turnstileErrorMessage(code?: string): string {
  switch (code) {
    case "110200":
    case "400021":
      return "O endereço usado para acessar a Horária não está autorizado na verificação de segurança. Acesse horaria.site ou entre em contato com o suporte.";
    case "110100":
    case "110110":
    case "400020":
    case "400070":
      return "A verificação de segurança não está configurada corretamente. Entre em contato com o suporte.";
    case "200500":
    case "SCRIPT_LOAD_ERROR":
      return "Não foi possível carregar a verificação de segurança. Verifique a conexão, bloqueadores do navegador e tente novamente.";
    case "110600":
    case "110620":
      return "A verificação de segurança expirou. Tente novamente.";
    default:
      return "A verificação de segurança não foi concluída. Tente novamente ou utilize outro navegador.";
  }
}
