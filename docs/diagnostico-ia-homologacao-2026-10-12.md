# Horária IA — homologação do diagnóstico visual sem gastos
Atualização: 2026-10-12

## Objetivo
A triagem local de defeitos deve funcionar sem rede nem custo. A análise real por
OpenAI continua BLOQUEADA por padrão: requer licença da empresa, consentimento,
fotos de uma OS autorizada, segredo do servidor, saldo pré-pago e liquidação.

## Testes já automatizados
- Sessão válida, função técnica, identificação de empresa e ordem, fotos privadas da própria OS.
- Permissão explícita do funcionário para enviar duas fotos, no máximo.
- Bloqueio de consumo sem saldo, empresa errada, recurso desligado ou API não ativada.
- Saldo explicitamente consultado para a empresa ativa, nunca a primeira empresa do usuário.
- Marca de início da chamada externa antes de gastar tokens; falha na marcação aborta o envio.
- Se a OpenAI gerar uma resposta, falha de liquidação não deve devolver o crédito; exige conciliação.
- Reservas efetivamente iniciadas não são automaticamente reembolsadas pelo recuperador de reservas antigas.
- Inserir hipóteses nas observações exige confirmação do técnico; não salva diagnóstico/OS e não emite orçamento.
- Fluxos adicionais testados com simulações; **não** provaram qualidade da identificação real de danos.

## Como fazer teste visual/manual
1. Use empresa e OS de teste, com consentimento dos titulares das fotografias.
2. Abra a OS -> Diagnóstico; descreva "não carrega" e gere triagem gratuita.
3. Confirme que o checklist sugerido não é dado como teste realizado.
4. Faça upload de uma foto de teste em Fotos da OS e retorne ao Diagnóstico.
5. Clique Atualizar fotos da OS, confira miniatura privada e selecione 1 ou 2 fotos.
6. Sem licença/créditos, o botão de análise paga deve permanecer indisponível.
7. Em ambiente de staging isolado, com chave de API específica e orçamento estrito,
   use pequeno saldo previamente pago e execute uma análise com imagens de teste.
8. Verifique sinal visível, limitação fotográfica e eventual erro da IA; só o técnico
   poderá usar o texto como rascunho e salvar manualmente.
9. Compare imagens com trincas, danos discretos, oxidação aparente, casos sem dano,
   baixa luz e fotos irrelevantes; documente falsos positivos/falsos negativos.

## Preço do crédito, antes de vender
O modelo GPT-6 Luna cobra pela entrada (incluindo imagens) e pela saída de texto;
o custo **não** é uma quantia fixa por foto. Consulte a calculadora oficial:
https://developers.openai.com/api/docs/guides/image-cost-calculator e a tabela:
https://developers.openai.com/api/docs/pricing.
Preço de venda deve cobrir maior custo observado por tipo de imagem, câmbio,
erros de rede, hospedagem, taxas, impostos e margem.

**Não aplicar ainda um preço ao banco ou aos planos.**
Básico (R$49) e Pro (R$80) permanecem inalterados.
O adicional de IA e o volume de créditos devem ser aprovados antes da cobrança.

## Dependências e limitações reais
- Chave e recursos pagos ainda desligados.
- Sem chamada real de visão no ambiente de homologação automatizada.
- A resposta do provedor não é diagnóstico confirmado; requer validação técnica.
- As fotos podem mostrar números de série ou dados pessoais; o funcionário deve
  conferir as imagens antes de dar consentimento.
- Falhas ambíguas da OpenAI podem ser tarifadas pelo provedor mesmo quando não
  há resposta; não é possível garantir despesa zero sem limites financeiros externos.
- **Nova regra de segurança:** após iniciar chamada externa, falhas de rede,
  timeouts e erros sem resposta deixam o crédito em RESERVA, sem estorno automático.
  O ADM deve conferir o uso real da API antes de liquidar ou devolver o crédito.
  O mesmo se aplica ao atendimento conversacional com IA.
- O cliente verá uma mensagem orientando a procurar o suporte e não repetir a
  chamada imediatamente; o estado reservado não significa consumo confirmado.
- Conciliação de reservas com chamada iniciada exige procedimento administrativo:
  não estornar automaticamente uma chamada que pode ter sido cobrada.
- Futuro WhatsApp exige API oficial Meta, credenciais, custos e consentimentos próprios.
