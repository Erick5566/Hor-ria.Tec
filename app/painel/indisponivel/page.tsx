import { FeatureUnavailable } from "@/components/panel-feature-gate";
export const metadata = {
  title: "Recurso indisponível | Horária",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main style={{ maxWidth: 640, margin: "12vh auto", padding: 24 }}>
      <FeatureUnavailable />
    </main>
  );
}
