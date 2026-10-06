import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { database } from "./helpers.mjs";

test("catalog: SECURITY DEFINER functions have fixed search_path and admin guards", async () => {
  const db = await database();
  try {
    const funcs = (
      await db.query(`select n.nspname schema,p.proname name,p.proconfig config,pg_get_functiondef(p.oid) definition
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prosecdef and n.nspname in ('public','private')`)
    ).rows;
    assert.ok(funcs.length >= 90);
    for (const f of funcs) {
      assert.ok(f.config?.includes('search_path=""'), f.name);
      if (
        f.schema === "public" &&
        f.name.startsWith("admin_") &&
        f.name !== "admin_email_provider_credentials"
      )
        assert.match(
          f.definition,
          /perform private\.require_super_admin\(\)/,
          f.name,
        );
    }
  } finally {
    await db.close();
  }
});

test("edge config: published JWT choices are reproducible locally", async () => {
  const config = await readFile("supabase/config.toml", "utf8");
  for (const [name, value] of [
    ["public-booking", false],
    ["public-tracking", false],
    ["whatsapp-notifications", false],
    ["admin-billing-email", false],
    ["invite-team-member", true],
  ]) {
    assert.match(
      config,
      new RegExp(`\\[functions\\.${name}\\]\\s*verify_jwt = ${value}`),
    );
  }
});
