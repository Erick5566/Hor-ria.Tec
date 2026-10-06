import { test } from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers.mjs";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { webcrypto } from "node:crypto";

const owner = "92000000-0000-4000-8000-000000000001",
  other = "92000000-0000-4000-8000-000000000002";
test("foto salva: correção transacional, auditoria e limpeza protegida", async (t) => {
  const db = await database();
  try {
    await db.exec(
      `insert into auth.users values('${owner}'),('${other}');set request.jwt.claim.sub='${owner}';set role authenticated;`,
    );
    const company = (
      await db.query(
        "select configurar_empresa('Foto Auditada','foto-auditada','{}',false,'[{\"nome\":\"Reparo\",\"duracao\":30}]') id",
      )
    ).rows[0].id;
    const order = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        company,
        { nome: "Cliente Isolado", whatsapp: "11911111111" },
        { categoria: "Celular", modelo: "Teste" },
        { problema: "Teste isolado foto" },
      ])
    ).rows[0].id;
    const old = `${company}/${order}/equipe/frente.jpg`;
    await db.query(
      'insert into storage.objects(bucket_id,name,metadata) values(\'os-fotos\',$1,\'{"mimetype":"image/jpeg","size":100}\')',
      [old],
    );
    const photo = (
      await db.query(
        "select registrar_foto($1,'Entrada','Ângulo: Frente') id",
        [old],
      )
    ).rows[0].id;
    const hash = "a".repeat(64);
    const prepare = async (action = "replace", f = photo, o = order) =>
      (
        await db.query("select prepare_os_photo_correction($1,$2,$3,$4) r", [
          o,
          f,
          action,
          action === "replace" ? hash : null,
        ])
      ).rows[0].r;
    const apply = async (id) =>
      (await db.query("select apply_os_photo_correction($1) r", [id])).rows[0]
        .r;
    const get = async () =>
      (await db.query("select * from fotos_os where id=$1", [photo])).rows[0];
    let op = await prepare();
    await t.test(
      "upload ausente/falha mantém imagem antiga e nenhum evento de substituição",
      async () => {
        await assert.rejects(apply(op.id), /Imagem inválida/);
        assert.equal((await get()).caminho, old);
        assert.equal(
          Number(
            (
              await db.query(
                "select count(*) n from historico_os where evento='Foto substituída'",
              )
            ).rows[0].n,
          ),
          0,
        );
      },
    );
    await t.test(
      "MIME inválido e arquivo acima de 6 MiB bloqueados no banco",
      async () => {
        await db.query(
          'insert into storage.objects(bucket_id,name,metadata) values(\'os-fotos\',$1,\'{"mimetype":"text/plain","size":100}\')',
          [op.path],
        );
        await assert.rejects(apply(op.id), /Imagem inválida/);
        await db.exec("reset role");
        await db.query(
          'update storage.objects set metadata=\'{"mimetype":"image/jpeg","size":6291457}\' where name=$1',
          [op.path],
        );
        await db.exec("set role authenticated");
        await assert.rejects(apply(op.id), /Imagem inválida/);
        assert.equal((await get()).caminho, old);
      },
    );
    await t.test(
      "erro de auditoria após UPDATE faz rollback do vínculo e conserva a imagem anterior",
      async () => {
        await db.exec("reset role");
        await db.query(
          'update storage.objects set metadata=\'{"mimetype":"image/jpeg","size":200}\' where name=$1',
          [op.path],
        );
        await db.exec(
          "create function private.fail_photo_audit() returns trigger language plpgsql as $$begin raise exception 'audit unavailable'; end$$;create trigger fail_photo_audit before insert on public.historico_os for each row when (new.evento='Foto substituída') execute function private.fail_photo_audit();set role authenticated;",
        );
        await assert.rejects(apply(op.id), /audit unavailable/);
        assert.equal((await get()).caminho, old);
        await db.exec(
          "reset role;drop trigger fail_photo_audit on public.historico_os;drop function private.fail_photo_audit();set role authenticated;",
        );
      },
    );
    await t.test(
      "substituição atualiza mesmo vínculo; ângulo e categoria preservados; sem oitava foto",
      async () => {
        await db.exec("reset role");
        await db.query(
          'update storage.objects set metadata=\'{"mimetype":"image/jpeg","size":200}\' where name=$1',
          [op.path],
        );
        await db.exec("set role authenticated");
        await apply(op.id);
        const loaded = await get();
        assert.equal(loaded.caminho, op.path);
        assert.equal(loaded.descricao, "Ângulo: Frente");
        assert.equal(loaded.categoria, "Entrada");
        assert.equal(loaded.url, "storage://os-fotos/" + op.path);
        assert.equal(
          Number(
            (
              await db.query(
                "select count(*) n from fotos_os where ordem_id=$1",
                [order],
              )
            ).rows[0].n,
          ),
          1,
        );
      },
    );
    await t.test(
      "reload consulta nova imagem; retry de commit é idempotente e auditado uma vez",
      async () => {
        await apply(op.id);
        assert.equal((await get()).caminho, op.path);
        const h = (
          await db.query(
            "select * from historico_os where evento='Foto substituída'",
          )
        ).rows;
        assert.equal(h.length, 1);
        assert.equal(h[0].usuario_id, owner);
        assert.equal(h[0].ordem_id, order);
        assert.ok(h[0].criado_em);
        assert.ok(h[0].detalhes.includes("Frente"));
        assert.equal(h[0].publico, false);
      },
    );
    await t.test(
      "falha parcial no Storage deixa limpeza durável e imagem nova intacta",
      async () => {
        await assert.rejects(
          db.query("select complete_os_photo_cleanup($1)", [op.id]),
          /ainda não removido/,
        );
        const q = (
          await db.query("select pending_os_photo_cleanup($1) q", [order])
        ).rows[0].q;
        assert.equal(q[0].path, old);
        assert.equal((await get()).caminho, op.path);
      },
    );
    await t.test(
      "Storage só permite limpar arquivo antigo auditado; nova imagem protegida",
      async () => {
        assert.equal(
          (
            await db.query(
              "delete from storage.objects where bucket_id='os-fotos' and name=$1 returning name",
              [op.path],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "delete from storage.objects where bucket_id='os-fotos' and name=$1 returning name",
              [old],
            )
          ).rows.length,
          1,
        );
        await db.query("select complete_os_photo_cleanup($1)", [op.id]);
        assert.equal(
          (await db.query("select pending_os_photo_cleanup($1) q", [order]))
            .rows[0].q.length,
          0,
        );
      },
    );
    await t.test(
      "caminho antigo não pode ser ressuscitado por registrar_foto",
      async () => {
        await assert.rejects(
          db.query(
            'insert into storage.objects(bucket_id,name,metadata) values(\'os-fotos\',$1,\'{"mimetype":"image/jpeg","size":100}\')',
            [old],
          ),
          /row-level security/,
        );
        await db.exec("reset role");
        await db.query(
          'insert into storage.objects(bucket_id,name,metadata) values(\'os-fotos\',$1,\'{"mimetype":"image/jpeg","size":100}\')',
          [old],
        );
        await db.exec("set role authenticated");
        await assert.rejects(
          db.query("select registrar_foto($1,'Entrada','Ângulo: Frente')", [
            old,
          ]),
          /encerrado/,
        );
      },
    );
    await t.test(
      "outro tenant não descobre caminhos, não substitui nem apaga",
      async () => {
        await db.exec(
          `reset role;set request.jwt.claim.sub='${other}';set role authenticated;`,
        );
        await assert.rejects(prepare(), /não autorizada/);
        await assert.rejects(apply(op.id), /não autorizada/);
        await assert.rejects(
          db.query("select pending_os_photo_cleanup($1)", [order]),
          /não autorizada/,
        );
        assert.equal(
          (
            await db.query(
              "delete from storage.objects where name=$1 returning name",
              [op.path],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query("select * from storage.objects where name=$1", [
              op.path,
            ])
          ).rows.length,
          0,
        );
        await db.exec(
          `reset role;set request.jwt.claim.sub='${owner}';set role authenticated;`,
        );
      },
    );
    await t.test("cancelar remoção mantém foto", async () => {
      const remove = await prepare("remove");
      await db.query("select cancel_os_photo_correction($1)", [remove.id]);
      assert.equal((await get()).caminho, op.path);
    });
    await t.test(
      "remoção auditada persiste após reload; arquivo removido somente pela fila",
      async () => {
        const remove = await prepare("remove");
        await apply(remove.id);
        await apply(remove.id);
        assert.equal(await get(), undefined);
        const h = (
          await db.query(
            "select * from historico_os where evento='Foto removida'",
          )
        ).rows;
        assert.equal(h.length, 1);
        assert.equal(h[0].usuario_id, owner);
        assert.equal(
          (await db.query("select pending_os_photo_cleanup($1) q", [order]))
            .rows[0].q[0].path,
          op.path,
        );
        assert.equal(
          (
            await db.query(
              "delete from storage.objects where name=$1 returning name",
              [op.path],
            )
          ).rows.length,
          1,
        );
        await db.query("select complete_os_photo_cleanup($1)", [remove.id]);
      },
    );
    await t.test(
      "tabelas privadas sem CRUD; anon sem RPC; bucket privado e limites mantidos",
      async () => {
        await assert.rejects(
          db.query("select * from private.os_photo_corrections"),
          /permission denied/,
        );
        await db.exec("reset role");
        const b = (
          await db.query("select * from storage.buckets where id='os-fotos'")
        ).rows[0];
        assert.equal(b.public, false);
        assert.equal(Number(b.file_size_limit), 6291456);
        await db.exec("reset role;set role anon");
        await assert.rejects(prepare(), /permission denied/);
      },
    );
  } finally {
    await db.close();
  }
});

function library() {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(readFileSync("lib/photo-corrections.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, require: () => ({ supabase: null }), crypto: webcrypto, File },
  );
  return exports;
}
test("foto salva: upload falha -> apply não chamado; imagem antiga mantida", async () => {
  const { correctSavedPhoto } = library();
  const calls = [];
  const db = {
    rpc: async (name) => {
      calls.push(name);
      return {
        data:
          name === "prepare_os_photo_correction"
            ? { id: "op", path: "new" }
            : { status: "cancelled" },
        error: null,
      };
    },
    storage: {
      from: () => ({ upload: async () => ({ error: Error("upload failed") }) }),
    },
  };
  await assert.rejects(
    correctSavedPhoto(
      "order",
      "photo",
      new File(["image"], "test.jpg", { type: "image/jpeg" }),
      db,
    ),
    /upload failed/,
  );
  assert.ok(!calls.includes("apply_os_photo_correction"));
  assert.ok(calls.includes("cancel_os_photo_correction"));
});
test("foto salva: banco falha -> cancelamento recuperável, sem DELETE no frontend", async () => {
  const { correctSavedPhoto } = library();
  let cancelled = false;
  const db = {
    rpc: async (name) =>
      name === "prepare_os_photo_correction"
        ? { data: { id: "op", path: "new" }, error: null }
        : name === "apply_os_photo_correction"
          ? { error: Error("database failed") }
          : ((cancelled = true),
            { data: { status: "cancelled" }, error: null }),
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
  await assert.rejects(
    correctSavedPhoto(
      "order",
      "photo",
      new File(["image"], "test.jpg", { type: "image/jpeg" }),
      db,
    ),
    /database failed/,
  );
  assert.ok(cancelled);
});
test("foto salva: resposta perdida após commit é reconciliada como aplicada", async () => {
  const { correctSavedPhoto } = library();
  const db = {
    rpc: async (name) =>
      name === "prepare_os_photo_correction"
        ? { data: { id: "op" }, error: null }
        : name === "apply_os_photo_correction"
          ? Promise.reject(Error("lost"))
          : { data: { status: "applied" }, error: null },
  };
  await correctSavedPhoto("order", "photo", undefined, db);
});
test("foto salva: MIME/tamanho inválidos rejeitados antes de qualquer RPC", async () => {
  const { correctSavedPhoto } = library();
  let calls = 0;
  const db = {
    rpc: () => {
      calls++;
    },
  };
  await assert.rejects(
    correctSavedPhoto(
      "o",
      "p",
      new File(["x"], "x.txt", { type: "text/plain" }),
      db,
    ),
    /JPEG/,
  );
  await assert.rejects(
    correctSavedPhoto(
      "o",
      "p",
      new File([new Uint8Array(6291457)], "x.jpg", { type: "image/jpeg" }),
      db,
    ),
    /6 MB/,
  );
  assert.equal(calls, 0);
});
