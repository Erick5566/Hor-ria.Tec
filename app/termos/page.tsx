import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Condições de uso da plataforma Horária para assistências técnicas.",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Brand />
        <Link href="/">Voltar ao início</Link>
      </header>

      <article className="legal-card">
        <span className="eyebrow">TERMOS DE USO</span>
        <h1>Termos de uso da Horária</h1>
        <p className="legal-updated">Atualizados em 1 de outubro de 2026.</p>

        <h2>1. Sobre a plataforma</h2>
        <p>
          A Horária é uma plataforma de gestão para assistências técnicas,
          destinada a organizar clientes, equipamentos, ordens de serviço,
          agenda, estoque, financeiro e etapas relacionadas ao atendimento.
        </p>

        <h2>2. Conta e acesso</h2>
        <p>
          O responsável pela assistência deve fornecer informações verdadeiras,
          proteger suas credenciais e controlar quais integrantes da equipe
          recebem acesso. Ações realizadas por usuários autorizados da empresa
          são consideradas parte da operação daquela assistência.
        </p>

        <h2>3. Dados dos clientes da assistência</h2>
        <p>
          A assistência é responsável pela origem, finalidade e uso dos dados
          pessoais que registra na Horária. Informações de clientes e
          equipamentos devem ser inseridas somente quando houver finalidade
          legítima relacionada ao atendimento.
        </p>

        <h2>4. Fotos e informações do equipamento</h2>
        <p>
          Fotos, números de série, IMEI, observações técnicas e outras
          informações do equipamento podem ser armazenados para documentar a
          ordem de serviço. Senhas de aparelhos devem ser solicitadas somente
          quando necessárias ao reparo e tratadas como informação restrita.
        </p>

        <h2>5. Página e acompanhamento públicos</h2>
        <p>
          A assistência é responsável pelas informações comerciais que decidir
          publicar. Links de acompanhamento destinam-se ao cliente relacionado
          ao atendimento e não devem ser compartilhados publicamente.
        </p>

        <h2>6. Pagamentos da Horária</h2>
        <p>
          Quando houver cobrança por Pix com confirmação manual, o pagamento
          somente será considerado confirmado após a validação administrativa
          da Horária. O envio de comprovante ou a realização de uma transferência
          não altera automaticamente o status da assinatura.
        </p>

        <h2>7. Uso adequado</h2>
        <p>
          Não é permitido usar a plataforma para acessar dados de outras
          empresas, contornar permissões, inserir conteúdo ilícito, atacar o
          serviço ou utilizar credenciais de terceiros sem autorização.
        </p>

        <h2>8. Disponibilidade e alterações</h2>
        <p>
          A plataforma pode receber correções, atualizações e manutenções para
          segurança e evolução do serviço. Funcionalidades podem ser ajustadas
          quando necessário, preservando os dados e a operação sempre que
          tecnicamente possível.
        </p>

        <h2>9. Cancelamento e dados</h2>
        <p>
          O cancelamento pode limitar o acesso à conta. A retenção e exclusão
          de dados observam a Política de Privacidade, as necessidades
          operacionais e as obrigações aplicáveis.
        </p>

        <h2>10. Privacidade</h2>
        <p>
          O tratamento de dados pessoais é descrito na{" "}
          <Link href="/privacidade">Política de Privacidade</Link>.
        </p>

        <h2>11. Atualizações destes termos</h2>
        <p>
          Estes termos podem ser atualizados para refletir mudanças no produto,
          na operação ou em requisitos aplicáveis. A versão vigente ficará
          disponível nesta página.
        </p>
      </article>
    </main>
  );
}
