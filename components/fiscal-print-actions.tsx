"use client";

export default function FiscalPrintActions() {
  function print() {
    window.print();
  }

  return (
    <div className="fiscal-print-actions no-print">
      <button className="primary" type="button" onClick={print}>
        Imprimir
      </button>
      <button className="outline" type="button" onClick={print}>
        Salvar em PDF
      </button>
      <small>
        Para PDF, escolha “Salvar como PDF” na janela de impressão do navegador.
      </small>
    </div>
  );
}
