import { Suspense } from "react";
import TeamInvitation from "@/components/team-invitation";
export const metadata = {
  title: "Convite da equipe",
  robots: { index: false, follow: false },
};
export default function InvitationPage() {
  return (
    <Suspense fallback={<p>Carregando convite…</p>}>
      <TeamInvitation />
    </Suspense>
  );
}
