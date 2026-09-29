"use client";
import Link from "next/link";
import { HorariaIcon } from "./horaria-icon";

const steps = [
  {
    title: "Informar o regime tributário",
    text: "Defina o enquadramento fiscal usado pela assistência.",
    done: false,
  },
  {
    title: "Escolher os tipos de nota",
    text: "Selecione os documentos fiscais que fazem sentido para sua operação.",
    done: false,
  },
  {
    title: "Enviar o certificado digital",
    text: "Conecte o certificado somente quando houver um provedor fiscal integrado.",
    done: false,
  },
  {
    title: "Conectar ao emissor fiscal",
    text: "A emissão automática será liberada depois da integração com um emissor compatível.",
    done: false,
  },
];

export default function FiscalNotes() {
  return (
    <div className="fiscal-video-page">
      <header className="fiscal-video-header">
        <div className="fiscal-video-icon">
          <HorariaIcon name="receipt" />
        </div>
        <div>
          <h2>Notas fiscais</h2>
          <p>Faltam alguns passos para você começar a emitir pelo Horária.</p>
        </div>
      </header>

      <section className="fiscal-video-setup">
        <div className="fiscal-video-copy">
          <small>CONFIGURAÇÃO INICIAL</small>
          <h3>Ativação em 4 passos</h3>
          <p>
            Faça a configuração uma vez. Depois, a emissão poderá entrar no fluxo
            da ordem de serviço quando houver integração fiscal ativa.
          </p>

          <ol className="fiscal-video-steps">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span>{index + 1}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.text}</small>
                </div>
              </li>
            ))}
          </ol>

          <button className="primary fiscal-video-continue" type="button">
            Continuar configuração
          </button>
        </div>

        <aside className="fiscal-video-warning">
          <strong>Integração fiscal pendente</strong>
          <p>
            A tela já está pronta para receber um emissor fiscal real. Até essa
            conexão existir, o Horária não marca notas como emitidas
            automaticamente.
          </p>
          <Link href="/painel/configuracoes">Ver configurações →</Link>
        </aside>
      </section>

      <section className="fiscal-video-stats">
        <article>
          <span>EMITIDAS NO MÊS</span>
          <strong>0</strong>
          <small>Nenhuma nota emitida pelo sistema</small>
        </article>
        <article>
          <span>PENDENTES</span>
          <strong>0</strong>
          <small>A integração fiscal ainda não está ativa</small>
        </article>
        <article>
          <span>CONFIGURAÇÃO</span>
          <strong>0/4</strong>
          <small>Etapas concluídas</small>
        </article>
      </section>

      <section className="fiscal-video-bottom">
        <div>
          <h3>Notas emitidas</h3>
          <p>Quando a emissão for integrada, os documentos aparecerão aqui.</p>
        </div>
        <div className="fiscal-video-empty">
          <HorariaIcon name="receipt" />
          <strong>Nenhuma nota fiscal ainda</strong>
          <small>Finalize a configuração para começar.</small>
        </div>
      </section>
    </div>
  );
}
