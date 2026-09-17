import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";

test("migration real: isolamento, escrita pública, disponibilidade e conflitos", async (t) => {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`,
  );
  await db.exec(
    "alter default privileges in schema public grant execute on functions to anon,authenticated",
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260916010515_horaria.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260916010950_validar_expediente.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260916010955_configuracao.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20260916011325_permissoes_explicitas.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await t.test(
    "privilégios padrão do Supabase não expõem funções internas",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const signature of [
          "public.validar_agendamento()",
          "public.validar_expediente()",
        ])
          assert.equal(
            (
              await db.query(
                "select has_function_privilege($1,$2,$3) as allowed",
                [role, signature, "EXECUTE"],
              )
            ).rows[0].allowed,
            false,
          );
      }
      assert.equal(
        (
          await db.query(
            "select has_function_privilege('anon','public.configurar_empresa(text,text,jsonb,boolean,jsonb)','EXECUTE') as allowed",
          )
        ).rows[0].allowed,
        false,
      );
    },
  );
  const a = "10000000-0000-0000-0000-000000000001",
    b = "10000000-0000-0000-0000-000000000002";
  await db.exec(`insert into auth.users values ('${a}'),('${b}')`);
  const role = async (r, uid = "") =>
    db.exec(`reset role; set request.jwt.claim.sub='${uid}'; set role ${r}`);
  const empresa = async (uid, slug) => {
    await role("authenticated", uid);
    return (
      await db.query(
        `insert into empresas(dono_id,nome,slug,horario) values($1,$2,$2,$3) returning id`,
        [
          uid,
          slug,
          Object.fromEntries(
            Array.from({ length: 7 }, (_, i) => [i, ["09:00", "18:00"]]),
          ),
        ],
      )
    ).rows[0].id;
  };
  const ea = await empresa(a, "empresa-a"),
    eb = await empresa(b, "empresa-b");
  const sb = (
    await db.query(
      "insert into servicos(empresa_id,nome,duracao) values($1,$2,30) returning id",
      [eb, "Corte B"],
    )
  ).rows[0].id;
  await role("authenticated", a);
  const sa = (
    await db.query(
      "insert into servicos(empresa_id,nome,duracao) values($1,$2,30) returning id",
      [ea, "Corte A"],
    )
  ).rows[0].id;
  const day = new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    start = day + "T12:00:00Z";
  await t.test("dono A não lê ou modifica empresa B", async () => {
    assert.equal((await db.query("select * from empresas")).rows.length, 1);
    assert.equal(
      (await db.query("select * from servicos where empresa_id=$1", [eb])).rows
        .length,
      0,
    );
    assert.equal(
      (
        await db.query(
          "update empresas set nome='Invadida' where id=$1 returning id",
          [eb],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query(
        "insert into servicos(empresa_id,nome,duracao) values($1,$2,30)",
        [eb, "Invasão"],
      ),
    );
    await assert.rejects(
      db.query("update empresas set dono_id=$1 where id=$2", [b, ea]),
    );
  });
  await role("anon");
  await t.test(
    "público não lê tabelas; catálogo não expõe dono ou clientes",
    async () => {
      for (const table of ["empresas", "servicos", "agendamentos"])
        await assert.rejects(db.query(`select * from ${table}`));
      const catalog = (
        await db.query("select catalogo($1) as c", ["empresa-a"])
      ).rows[0].c;
      assert.equal(catalog.nome, "empresa-a");
      assert.equal(catalog.dono_id, undefined);
      assert.equal(catalog.servicos.length, 1);
    },
  );
  const reserve = (service = sa, time = start) =>
    db.query(
      "insert into agendamentos(empresa_id,servico_id,nome_cliente,telefone,inicio) values($1,$2,$3,$4,$5)",
      [ea, service, "Cliente teste", "11999999999", time],
    );
  await t.test(
    "público insere sem leitura e não pode misturar empresas",
    async () => {
      await assert.rejects(reserve(sb));
      await reserve();
      await assert.rejects(
        db.query("update agendamentos set status='concluido'"),
      );
      await assert.rejects(db.query("delete from agendamentos"));
      await assert.rejects(
        db.query(
          "insert into agendamentos(empresa_id,inicio,fim,bloqueio) values($1,$2,$3,true)",
          [ea, start, day + "T13:00:00Z"],
        ),
      );
    },
  );
  await t.test(
    "horários ocupados, sobrepostos e fora do expediente são rejeitados",
    async () => {
      await assert.rejects(reserve());
      await assert.rejects(reserve(sa, day + "T12:15:00Z"));
      await assert.rejects(reserve(sa, day + "T23:00:00Z"));
      const slots = (
        await db.query("select * from horarios_disponiveis($1,$2,$3)", [
          "empresa-a",
          sa,
          day,
        ])
      ).rows;
      assert.ok(slots.length > 0);
      assert.ok(
        !slots.some(
          (s) => new Date(s.inicio).getTime() === new Date(start).getTime(),
        ),
      );
    },
  );
  await role("authenticated", b);
  await t.test("dono B não lê nem atualiza reservas de A", async () => {
    assert.equal((await db.query("select * from agendamentos")).rows.length, 0);
    assert.equal(
      (
        await db.query(
          "update agendamentos set status='em_atendimento' returning id",
        )
      ).rows.length,
      0,
    );
  });
  await role("authenticated", a);
  await t.test(
    "status avança em sequência e bloqueio impede reserva",
    async () => {
      await assert.rejects(
        db.query("update agendamentos set status='concluido'"),
      );
      await db.exec(
        "update agendamentos set status='em_atendimento'; update agendamentos set status='concluido'",
      );
      await db.query(
        "insert into agendamentos(empresa_id,inicio,fim,bloqueio) values($1,$2,$3,true)",
        [ea, day + "T14:00:00Z", day + "T15:00:00Z"],
      );
      await role("anon");
      await assert.rejects(reserve(sa, day + "T14:15:00Z"));
    },
  );
  await t.test(
    "campos obrigatórios e status público não podem ser adulterados",
    async () => {
      await assert.rejects(
        db.query(
          "insert into agendamentos(empresa_id,servico_id,inicio) values($1,$2,$3)",
          [ea, sa, day + "T16:00:00Z"],
        ),
      );
      await assert.rejects(
        db.query(
          "insert into agendamentos(empresa_id,servico_id,nome_cliente,telefone,inicio,status) values($1,$2,'Cliente','11999999999',$3,'concluido')",
          [ea, sa, day + "T16:00:00Z"],
        ),
      );
      await assert.rejects(reserve(sa, "2020-01-01T12:00:00Z"));
      await assert.rejects(reserve(sa, day + "T16:01:00Z"));
    },
  );
  await t.test(
    "intervalos adjacentes são aceitos e duração é calculada pelo banco",
    async () => {
      await reserve(sa, day + "T12:30:00Z");
      await role("authenticated", a);
      const rows = (
        await db.query(
          "select inicio,fim from agendamentos where not bloqueio order by inicio",
        )
      ).rows;
      assert.equal(rows.length, 2);
      assert.equal(
        new Date(rows[1].fim) - new Date(rows[1].inicio),
        30 * 60000,
      );
    },
  );
  await t.test(
    "expediente inválido e endereço obrigatório são validados",
    async () => {
      await assert.rejects(
        db.query("update empresas set horario=$1 where id=$2", [
          { 1: ["18:00", "09:00"] },
          ea,
        ]),
      );
      await assert.rejects(
        db.query("update empresas set horario=$1 where id=$2", [
          { 1: ["09:01", "18:00"] },
          ea,
        ]),
      );
      await db.query(
        "update empresas set solicitar_endereco=true where id=$1",
        [ea],
      );
      await role("anon");
      await assert.rejects(reserve(sa, day + "T16:00:00Z"));
    },
  );
  await t.test(
    "configuração é atômica e usuário anônimo não pode criar empresa",
    async () => {
      await assert.rejects(
        db.query("select configurar_empresa('Nome','nome','{}',false,'[]')"),
      );
      await db.exec("reset role");
      const c = "10000000-0000-0000-0000-000000000003";
      await db.query("insert into auth.users values($1)", [c]);
      await role("authenticated", c);
      await assert.rejects(
        db.query("select configurar_empresa($1,$2,$3,false,$4)", [
          "Nova empresa",
          "nova",
          { 1: ["09:00", "18:00"] },
          [{ nome: "Inválido", duracao: 0 }],
        ]),
      );
      assert.equal((await db.query("select * from empresas")).rows.length, 0);
      await db.query("select configurar_empresa($1,$2,$3,false,$4)", [
        "Nova empresa",
        "nova",
        { 1: ["09:00", "18:00"] },
        [{ nome: "Serviço", duracao: 30 }],
      ]);
      assert.equal((await db.query("select * from empresas")).rows.length, 1);
      assert.equal((await db.query("select * from servicos")).rows.length, 1);
    },
  );
  await db.close();
});
