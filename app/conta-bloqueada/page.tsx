import { Brand } from "@/components/brand";
import SignOutButton from "@/components/sign-out-button";
import BlockedAccessSync from "@/components/blocked-access-sync";

export default function BlockedPage() {
  return (
    <main className="state-page">
      <BlockedAccessSync />
      <Brand />
      <section className="state-card">
        <span className="state-icon">!</span>
        <span className="eyebrow">ACESSO TEMPORARIAMENTE LIMITADO</span>
        <h1>Esta conta está temporariamente suspensa.</h1>
        <p>
          Os clientes, ordens, fotos, histórico e configurações permanecem
          armazenados. Entre em contato com o suporte para regularizar ou
          reativar sua assinatura.
        </p>
        <p>
          Após a confirmação do pagamento ou reativação, esta tela verifica a
          liberação automaticamente.
        </p>
        <SignOutButton />
      </section>
    </main>
  );
}
