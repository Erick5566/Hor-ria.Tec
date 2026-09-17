import next from "next";
import http from "node:http";
const app = next({ dev: false, hostname: "127.0.0.1" });
await app.prepare();
const server = http.createServer(app.getRequestHandler());
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  for (const path of [
    "/",
    "/entrar",
    "/cadastro",
    "/manutencao",
    "/conta-bloqueada",
    "/admin",
    "/admin/configuracoes",
    "/painel",
    "/painel/mesa-reparo",
    "/painel/vendas",
    "/painel/ordens/nova",
    "/painel/financeiro",
    "/painel/estoque",
    "/painel/empresa",
    "/acompanhar",
    "/empresa-inexistente",
    "/agendar/empresa-inexistente",
  ]) {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    const body = await r.text();
    if (r.status !== 200 || !body.includes("Horária"))
      throw new Error(`${path}: HTTP ${r.status}`);
    console.log(`Runtime HTTP OK: ${path}`);
  }
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await app.close();
}
