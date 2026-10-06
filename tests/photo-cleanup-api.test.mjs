import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function route(access) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(
      readFileSync("app/api/photos/cleanup/route.ts", "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      URL,
      require: (name) =>
        name === "next/server"
          ? {
              NextResponse: {
                json: (body, options) => Response.json(body, options),
              },
            }
          : { getServerAccess: async () => access },
    },
  );
  return exports.POST;
}
const request = (
  origin = "https://horaria.site",
  body = { orderId: "11111111-1111-4111-8111-111111111111" },
) =>
  new Request("https://horaria.site/api/photos/cleanup", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test("limpeza: origem externa e sessão ausente bloqueadas", async () => {
  const post = route(null);
  assert.equal((await post(request("https://evil.invalid"))).status, 403);
  assert.equal((await post(request())).status, 401);
});
test("limpeza: tenant errado nunca recebe nem remove caminho privado", async () => {
  let removed = false;
  const post = route({
    client: {
      rpc: async () => ({ error: { message: "tenant denied" } }),
      storage: {
        from: () => ({
          remove: () => {
            removed = true;
          },
        }),
      },
    },
  });
  assert.equal((await post(request())).status, 403);
  assert.equal(removed, false);
});
test("limpeza: falha do Storage deixa pendência; nunca confirma remoção antes da API", async () => {
  const names = [];
  const post = route({
    client: {
      rpc: async (name) => {
        names.push(name);
        return { data: [{ id: "op", path: "private-old" }], error: null };
      },
      storage: {
        from: () => ({
          remove: async (paths) => {
            assert.deepEqual(Array.from(paths), ["private-old"]);
            return { error: Error("storage offline") };
          },
        }),
      },
    },
  });
  const response = await post(request());
  assert.equal((await response.json()).pending, 1);
  assert.ok(!names.includes("complete_os_photo_cleanup"));
});
test("limpeza: usa somente caminhos da fila, via Storage API, e confirma após sucesso", async () => {
  let done = false;
  const post = route({
    client: {
      rpc: async (name) => {
        if (name === "complete_os_photo_cleanup") {
          done = true;
          return { error: null };
        }
        return {
          data: done ? [] : [{ id: "op", path: "guarded/path" }],
          error: null,
        };
      },
      storage: {
        from: (bucket) => {
          assert.equal(bucket, "os-fotos");
          return {
            remove: async (paths) => {
              assert.equal(paths[0], "guarded/path");
              return { error: null };
            },
          };
        },
      },
    },
  });
  const r = await post(
    request(undefined, {
      orderId: "11111111-1111-4111-8111-111111111111",
      path: "victim/file",
    }),
  );
  assert.equal((await r.json()).pending, 0);
  assert.ok(done);
});
test("limpeza: resposta perdida ao confirmar mantém limpeza recuperável para retry", async () => {
  const post = route({
    client: {
      rpc: async (name) =>
        name === "complete_os_photo_cleanup"
          ? { error: Error("lost completion") }
          : { data: [{ id: "op", path: "guarded/path" }], error: null },
      storage: { from: () => ({ remove: async () => ({ error: null }) }) },
    },
  });
  assert.equal((await (await post(request())).json()).pending, 1);
});
