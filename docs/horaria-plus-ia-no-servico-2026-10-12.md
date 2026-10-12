# Horária Plus — IA integrada ao trabalho técnico (sem cobrança)

## Regra comercial mantida
- **Horária Básico**: assinatura código `HORARIA`, recursos de IA totalmente ocultos no painel, no formulário de OS, na aba Diagnóstico e na Ajuda. Não há upsell intrusivo.
- **Horária Plus**: nome da experiência de assistência inteligente que usa o plano superior atualmente cadastrado como `HORARIA_PRO` (Horária Pro).
- A implementação não cria um terceiro plano, não altera R$49/R$80, não migra contas, nem habilita serviço automaticamente.
- A regra é verificada **também no servidor**, mesmo quando `aiEnabled` foi ligado indevidamente para uma conta Básica.

## Novo fluxo na assistência superior
1. Assinante começa a registrar nova OS.
2. Em Estado e problema, ao descrever o defeito com 3+ caracteres, surge de forma contextual o copiloto técnico Horária Plus.
3. Sugestões iniciais exibem causas possíveis e testes. A pessoa pode alternar entre ambos e copiar o plano.
4. Nenhum dado do cliente, IMEI ou senha é transmitido ou gravado pela triagem local.
5. Após criar a OS, a aba Diagnóstico continua a orientar a partir do relato original e permite aproveitar sugestões como rascunho **somente por ação explícita do técnico**.
6. Análise de fotos por OpenAI fica em seção recolhida e só aparece para empresas superiores que tenham `aiEnabled` ativado. Exige fotos privadas, autorização explícita e créditos pré-pagos.

## Visual
- Cores e identidade integradas ao painel, painel contextual em vez de chat flutuante, compacto e responsivo de 320px a desktop.
- Ajuda: chatbot Plus recolhido por padrão. Basic: tutorial convencional sem qualquer cartão de IA.

## Segurança e pré-deploy
- Testes de entitlements e rotas verificam ausência de chamadas externas em `HORARIA`.
- As rotas `/api/ai/chat` e `/api/ai/diagnosis` retornam `PLUS_REQUIRED` (403) para Básico.
- Não requer migração de banco nesta implementação; o código de assinatura `HORARIA_PRO` já existe.
- OpenAI e WhatsApp permanecem desligados, sem recargas automáticas ou chamadas reais.
- Deploy Vercel somente quando limite gratuito permitir e após testes na branch principal.
