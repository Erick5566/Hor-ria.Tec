import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("edge functions públicas preferem secret keys modernas com fallback legado", async () => {
  for (const file of [
    "supabase/functions/public-booking/index.ts",
    "supabase/functions/public-tracking/index.ts",
  ]) {
    const source = await readFile(file, "utf8");

    assert.match(source, /Deno\.env\.get\("SUPABASE_SECRET_KEYS"\)/);
    assert.match(source, /JSON\.parse\(secretKeys\)/);
    assert.match(source, /parsed\.default/);
    assert.match(source, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
    assert.match(source, /const serviceKey = getSupabaseAdminKey\(\)/);

    assert.ok(
      source.indexOf('Deno.env.get("SUPABASE_SECRET_KEYS")') <
        source.indexOf('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")'),
      `${file} deve priorizar a secret key moderna antes do fallback legado`,
    );
  }
});
