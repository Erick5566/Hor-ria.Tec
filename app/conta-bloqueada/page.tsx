import { Brand } from "@/components/brand";
import SignOutButton from "@/components/sign-out-button";
export default function BlockedPage() { return <main className="state-page"><Brand /><section className="state-card"><span className="state-icon">!</span><span className="eyebrow">ACESSO TEMPORARIAMENTE LIMITADO</span><h1>Esta conta está temporariamente suspensa.</h1><p>Os clientes, ordens, fotos, histórico e configurações permanecem armazenados. Entre em contato com o suporte para regularizar ou reativar sua assinatura.</p><SignOutButton /></section></main>; }
