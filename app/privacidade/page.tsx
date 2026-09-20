import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description:
    "Entenda como dados de empresas, clientes e atendimentos são tratados na Horária.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <Brand />
        <Link href="/">Voltar ao início</Link>
      </header>

      <article className="legal-card">
        <span className="eyebrow">PRIVACIDADE E DADOS</span>
        <h1>Política de privacidade</h1>
        <p className="legal-updated">Atualizada em 20 de setembro de 2026.</p>

        <h2>1. O que é a Horária</h2>
        <p>
          A Horária é uma plataforma de gestão para assistências técnicas. Cada
          assistência utiliza seu próprio espaço para organizar clientes,
          equipamentos, ordens de serviço, agenda, orçamento, estoque e demais
          atividades relacionadas ao atendimento.
        </p>

        <h2>2. Quais dados podem ser tratados</h2>
        <p>
          Dependendo do uso, podem ser tratados dados como nome, telefone,
          e-mail, endereço, informações do equipamento, fotos enviadas pelo
          cliente, histórico do atendimento, agendamentos e informações
          necessárias para a gestão da assistência.
        </p>

        <h2>3. Para que os dados são usados</h2>
        <p>
          Os dados são utilizados para criar e administrar contas, registrar
          atendimentos, executar agendamentos, acompanhar reparos, comunicar
          alterações de status, manter histórico operacional, prevenir abuso e
          manter a segurança do serviço.
        </p>

        <h2>4. Responsabilidade da assistência</h2>
        <p>
          A assistência que recebe dados de seus clientes é responsável pelo
          uso dessas informações dentro de sua operação. A Horária fornece a
          infraestrutura para que esses registros sejam organizados e acessados
          apenas por usuários autorizados daquela empresa.
        </p>

        <h2>5. Compartilhamento</h2>
        <p>
          Informações podem ser processadas por provedores de infraestrutura
          estritamente necessários ao funcionamento, segurança, armazenamento e
          autenticação da plataforma. A Horária não cria uma vitrine pública de
          dados privados de clientes.
        </p>

        <h2>6. Segurança e acesso</h2>
        <p>
          O sistema utiliza autenticação, isolamento por empresa e regras de
          permissão para limitar o acesso aos dados. Usuários devem manter suas
          credenciais protegidas e utilizar senhas seguras.
        </p>

        <h2>7. Retenção e exclusão</h2>
        <p>
          Dados podem ser mantidos enquanto forem necessários para a prestação
          do serviço, para o histórico operacional ou para obrigações
          aplicáveis. Solicitações sobre correção ou exclusão devem ser
          direcionadas à assistência responsável pelo atendimento ou ao
          responsável pela conta Horária.
        </p>

        <h2>8. Direitos do titular</h2>
        <p>
          Quando aplicável, o titular pode solicitar informações, correção,
          atualização ou exclusão de seus dados, observadas as hipóteses legais
          de retenção e as responsabilidades da assistência que realizou o
          atendimento.
        </p>

        <h2>9. Páginas públicas</h2>
        <p>
          Páginas públicas das assistências podem exibir informações que a
          própria empresa escolheu publicar, como nome comercial, contatos,
          endereço, horários, serviços, mapa e links de avaliação.
        </p>

        <h2>10. Atualizações</h2>
        <p>
          Esta política pode ser atualizada para refletir mudanças técnicas,
          operacionais ou legais. A versão vigente ficará disponível nesta
          página.
        </p>
      </article>
    </main>
  );
}
