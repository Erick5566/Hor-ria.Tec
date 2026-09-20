import { ImageResponse } from "next/og";

export const alt = "Horária — gestão para assistência técnica";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 82px",
          color: "white",
          background:
            "radial-gradient(circle at 82% 16%, #3A4DA1 0%, transparent 35%), linear-gradient(135deg, #071B36 0%, #0B2648 60%, #06162C 100%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 16,
              background: "#68B5E4",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 800,
            }}
          >
            H
          </div>
          <div style={{ fontSize: 38, fontWeight: 800 }}>Horária</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 66, fontWeight: 800, letterSpacing: -2 }}>
            Sua assistência técnica, organizada de verdade.
          </div>
          <div style={{ fontSize: 28, color: "#C9DCF6" }}>
            Ordens, agenda, clientes, equipamentos, estoque e financeiro em um
            só lugar.
          </div>
        </div>
      </div>
    ),
    size,
  );
}
