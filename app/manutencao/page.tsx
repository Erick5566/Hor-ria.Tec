import { Brand } from "@/components/brand";
import SignOutButton from "@/components/sign-out-button";
export default function MaintenancePage() { return <main className="state-page"><Brand /><section className="state-card"><span className="state-icon">⚙</span><span className="eyebrow">MANUTENÇÃO PROGRAMADA</span><h1>Estamos realizando uma atualização na Horária.</h1><p>Seus dados continuam seguros. O sistema estará disponível novamente em breve.</p><SignOutButton /></section></main>; }
