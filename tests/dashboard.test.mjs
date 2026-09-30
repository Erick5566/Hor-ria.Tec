import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { database } from "./helpers.mjs";

async function loadTS(file, globals = {}) {
  const source = await readFile(file, "utf8");
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    { exports, Intl, Date, ...globals },
  );
  return exports;
}

test("painel: gráfico com um ponto é visível, vazio não inventa dados e números inválidos são tratados", async () => {
  const { trendGeometry, normalizeDashboard } =
    await loadTS("lib/dashboard.ts");
  const one = trendGeometry([
    { key: "2026-09-29", opened: 1, active: 1, finalized: 0 },
  ]);
  assert.equal(one.hasData, true);
  assert.equal(one.points("opened")[0].x, 50);
  assert.equal(trendGeometry([]).hasData, false);
  assert.equal(
    trendGeometry([{ key: "2026-09-29", opened: 0, active: 0, finalized: 0 }])
      .hasData,
    false,
  );
  const normalized = normalizeDashboard({
    metrics: { periodOrders: NaN },
    spark: { orders: [Infinity, 1] },
    status: { andamento: 0 },
    performance: { completionRate: 0, averageRepairDays: null },
    trend: [{ key: "2026-09-29", opened: NaN, active: 1, finalized: 0 }],
    latestOrders: [],
    todayAgenda: [],
    priorities: [],
  });
  assert.equal(normalized.metrics.periodOrders, 0);
  assert.equal(normalized.spark.orders[0], 0);
  assert.equal(normalized.performance.averageRepairDays, null);
  assert.throws(() => normalizeDashboard(null));
  assert.throws(() => normalizeDashboard({}));
});

test("painel: atrasos usam São Paulo e não destacam ordens concluídas nem atendimentos iniciados", async () => {
  const { orderOverdue, appointmentOverdue } = await loadTS("lib/dashboard.ts");
  const now = new Date("2026-09-30T01:30:00Z"); // 29/09 in São Paulo
  assert.equal(
    orderOverdue({ status: "novo", prazo_previsto: "2026-09-29" }, now),
    false,
  );
  assert.equal(
    orderOverdue({ status: "novo", prazo_previsto: "2026-09-28" }, now),
    true,
  );
  assert.equal(
    orderOverdue({ status: "finalizado", prazo_previsto: "2026-09-28" }, now),
    false,
  );
  assert.equal(
    appointmentOverdue(
      { status: "aguardando", inicio: "2026-09-30T01:00:00Z" },
      now,
    ),
    true,
  );
  assert.equal(
    appointmentOverdue(
      { status: "em_atendimento", inicio: "2026-09-30T01:00:00Z" },
      now,
    ),
    false,
  );
});

test("painel: Realtime, polling, reconexão, coalescência e limpeza dos recursos", async () => {
  const timers = new Map(),
    intervals = new Map(),
    listeners = new Map(),
    bindings = [];
  let next = 1,
    subscribed,
    removed = 0,
    calls = 0,
    release;
  const doc = {
    visibilityState: "visible",
    addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: (key) => listeners.delete(key),
  };
  const nav = { onLine: true };
  const win = {
    addEventListener: doc.addEventListener,
    removeEventListener: doc.removeEventListener,
  };
  const { watchDashboard } = await loadTS("lib/dashboard-live.ts", {
    document: doc,
    navigator: nav,
    window: win,
    setTimeout: (fn) => {
      const id = next++;
      timers.set(id, fn);
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, ms) => {
      assert.equal(ms, 10000);
      const id = next++;
      intervals.set(id, fn);
      return id;
    },
    clearInterval: (id) => intervals.delete(id),
  });
  const channel = {
    on: (event, spec, fn) => {
      bindings.push({ event, spec, fn });
      return channel;
    },
    subscribe: (fn) => {
      subscribed = fn;
      return channel;
    },
  };
  const stop = watchDashboard(
    {
      channel: () => channel,
      removeChannel: () => {
        removed++;
      },
    },
    "test-company",
    async () => {
      calls++;
      await new Promise((resolve) => {
        release = resolve;
      });
    },
  );
  const flush = () => {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach((fn) => fn());
  };
  assert.equal(bindings.length, 5);
  assert.ok(
    bindings.every((b) => b.spec.filter === "empresa_id=eq.test-company"),
  );
  subscribed("SUBSCRIBED");
  flush();
  assert.equal(calls, 1);
  bindings[0].fn();
  bindings[1].fn();
  flush();
  assert.equal(calls, 1);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  flush();
  assert.equal(calls, 2);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  doc.visibilityState = "hidden";
  [...intervals.values()][0]();
  assert.equal(calls, 2);
  doc.visibilityState = "visible";
  listeners.get("visibilitychange")();
  flush();
  assert.equal(calls, 3);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  [...intervals.values()][0]();
  assert.equal(calls, 4);
  stop();
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removed, 1);
  assert.equal(listeners.size, 0);
  assert.equal(timers.size, 0);
  assert.equal(intervals.size, 0);
});

test("painel: SQL real ordena antes do limite, herda prioridade na agenda e preserva isolamento", async () => {
  const db = await database();
  try {
    const owner = "10000000-0000-0000-0000-000000000001",
      outsider = "10000000-0000-0000-0000-000000000002";
    await db.exec(
      `insert into auth.users values('${owner}'),('${outsider}');set request.jwt.claim.sub='${owner}';set role authenticated`,
    );
    const eid = (
      await db.query(
        `select configurar_empresa('Painel','dashboard-test','{}',false,'[{"nome":"Reparo","duracao":30}]') id`,
      )
    ).rows[0].id;
    const day = (
      await db.query(
        `select (now() at time zone 'America/Sao_Paulo')::date::text as dashboard_day`,
      )
    ).rows[0].dashboard_day;
    const overview = async () =>
      (await db.query("select dashboard_overview($1,$1) data", [day])).rows[0]
        .data;
    const empty = await overview();
    assert.equal(empty.metrics.periodOrders, 0);
    assert.equal(empty.status.andamento, 0);
    assert.equal(empty.latestOrders.length, 0);
    const orders = [];
    for (let i = 0; i < 8; i++) {
      const id = (
        await db.query("select criar_ordem($1,$2,$3,$4) id", [
          eid,
          { nome: `Teste ${i}`, whatsapp: `1100000000${i}` },
          { categoria: "Notebook", modelo: "Teste" },
          { problema: "Não liga" },
        ])
      ).rows[0].id;
      orders.push(id);
      await db.query("update ordens_servico set prioridade=$1 where id=$2", [
        i === 7 ? "urgente" : i === 6 ? "alta" : "normal",
        id,
      ]);
    }
    await db.query(
      "update ordens_servico set status='aguardando_peca' where id=$1",
      [orders[1]],
    );
    const loaded = await overview();
    assert.ok(loaded.trend.some((point) => point.parts === 1));
    assert.equal(loaded.latestOrders.length, 6);
    assert.equal(loaded.latestOrders[0].id, orders[7]);
    assert.equal(loaded.latestOrders[1].id, orders[6]);
    assert.equal(loaded.latestOrders[2].id, orders[0]);
    const sid = (
      await db.query("select id from servicos where empresa_id=$1 limit 1", [
        eid,
      ])
    ).rows[0].id;
    // Deterministic past appointments exercise dashboard data, not the future-time validator.
    await db.exec(
      "reset role;alter table agendamentos disable trigger validar;set role authenticated",
    );
    for (let i = 0; i < 3; i++)
      await db.query(
        `insert into agendamentos(empresa_id,servico_id,nome_cliente,telefone,inicio,fim,ordem_id) values($1,$2,'Teste','11000000000',$3::timestamptz,$3::timestamptz+interval '30 minutes',$4)`,
        [
          eid,
          sid,
          `${day}T${String(8 + i).padStart(2, "0")}:00:00-03:00`,
          i === 2 ? orders[7] : null,
        ],
      );
    await db.exec(
      "reset role;alter table agendamentos enable trigger validar;set role authenticated",
    );
    let agenda = (await overview()).todayAgenda;
    assert.equal(agenda.length, 3);
    assert.equal(agenda[0].prioridade, "urgente");
    assert.equal(agenda[1].prioridade, "normal");
    assert.ok(agenda[1].inicio < agenda[2].inicio);
    await db.query("update ordens_servico set prioridade='baixa' where id=$1", [
      orders[7],
    ]);
    agenda = (await overview()).todayAgenda;
    assert.equal(agenda[2].prioridade, "baixa");
    await db.query(
      "update ordens_servico set status='finalizado' where id=$1",
      [orders[0]],
    );
    const finished = await overview();
    assert.ok(finished.performance.completionRate > 0);
    assert.notEqual(finished.performance.averageRepairDays, null);
    await db.exec(`set request.jwt.claim.sub='${outsider}'`);
    assert.equal(await overview(), null);
  } finally {
    await db.close();
  }
});

test("cards superiores: minigráficos têm variação real e base zero, sem inventar movimento", async () => {
  const { sparkGeometry } = await loadTS("lib/dashboard.ts");
  const movement = sparkGeometry([0, 3, 0]);
  assert.equal(movement.hasData, true);
  assert.notEqual(movement.line, sparkGeometry([0, 0, 0]).line);
  assert.equal(movement.last.y, 42);
  assert.equal(sparkGeometry([0, 0, 0]).hasData, false);
  assert.equal(sparkGeometry([]).hasData, false);
  assert.equal(sparkGeometry([3]).last.x, 50);
});

test("cards superiores: SQL mantém movimento anterior aos últimos sete dias do período", async () => {
  const db = await database();
  try {
    const uid = "10000000-0000-0000-0000-000000000001";
    await db.exec(
      `insert into auth.users values('${uid}');set request.jwt.claim.sub='${uid}';set role authenticated`,
    );
    const eid = (
      await db.query(
        `select configurar_empresa('Cards','cards-test','{}',false,'[{"nome":"Reparo","duracao":30}]') id`,
      )
    ).rows[0].id;
    const oid = (
      await db.query("select criar_ordem($1,$2,$3,$4) id", [
        eid,
        { nome: "Teste", whatsapp: "11000000000" },
        { categoria: "Notebook", modelo: "Teste" },
        { problema: "Não liga" },
      ])
    ).rows[0].id;
    const range = (
      await db.query(
        `select (now() at time zone 'America/Sao_Paulo')::date::text as end_date,((now() at time zone 'America/Sao_Paulo')::date-20)::text as start_date`,
      )
    ).rows[0];
    // Historical fixture for aggregation only; never modifies a production record.
    await db.exec("reset role;alter table ordens_servico disable trigger user");
    await db.query(
      `update ordens_servico set criado_em=($1::date+interval '12 hours') at time zone 'America/Sao_Paulo' where id=$2`,
      [range.start_date, oid],
    );
    await db.exec(
      "alter table ordens_servico enable trigger user;set role authenticated",
    );
    const data = (
      await db.query("select dashboard_overview($1,$2) data", [
        range.start_date,
        range.end_date,
      ])
    ).rows[0].data;
    assert.equal(data.metrics.periodOrders, 1);
    assert.equal(data.spark.orders.length, 21);
    assert.equal(data.spark.orders[0], 1);
    assert.equal(
      data.spark.orders.reduce((a, b) => a + b, 0),
      1,
    );
    assert.equal(
      data.spark.orders.slice(-7).reduce((a, b) => a + b, 0),
      0,
    );
  } finally {
    await db.close();
  }
});
