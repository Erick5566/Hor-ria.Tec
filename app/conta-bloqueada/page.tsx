import { Brand } from "@/components/brand";
import SignOutButton from "@/components/sign-out-button";
import ExpiredPayment from "@/components/expired-payment";
import { getServerAccess } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export default async function BlockedPage() {
  const session = await getServerAccess();
  if (!session) redirect("/entrar");
  const { company, subscription, billing } = session.context;
  if (company && ["ACTIVE", "TRIAL", "PAST_DUE"].includes(company.status)) {
    redirect("/painel");
  }

  const dueAt = subscription?.status === "TRIAL"
    ? subscription.trialEndsAt
    : subscription?.nextBillingDate || subscription?.trialEndsAt;
  const isBillingExpired = !!dueAt && new Date(dueAt).getTime() <= Date.now();
  const allowPayment = !!company && !!subscription
    && company.status === "SUSPENDED"
    && isBillingExpired;

  return (
    <main className="state-page">
      <Brand />
      {allowPayment && subscription ? (
        <ExpiredPayment
          status={subscription.status}
          hasApprovedPayment={billing?.hasApprovedPayment ?? false}
          amounts={billing || undefined}
        />
      ) : (
        <section className="state-card">
          <span className="state-icon">!</span>
          <span className="eyebrow">ACESSO TEMPORARIAMENTE LIMITADO</span>
          <h1>Esta conta está temporariamente suspensa.</h1>
          <p>Os clientes, ordens, fotos, histórico e configurações permanecem armazenados. Entre em contato com o suporte para regularizar ou reativar sua assinatura.</p>
          <SignOutButton />
        </section>
      )}
    </main>
  );
}
