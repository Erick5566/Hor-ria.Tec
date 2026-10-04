import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Supabase: frontend prefere publishable key moderna com fallback legado", async () => {
  for (const file of [
    "lib/supabase.ts",
    "app/sitemap.ts",
    "lib/server-auth.ts",
    "app/api/auth/session/route.ts",
  ]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
    assert.match(source, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    assert.ok(
      source.indexOf("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") <
        source.indexOf("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      `${file} deve priorizar a publishable key moderna`,
    );
  }

  const example = await readFile(".env.example", "utf8");
  assert.match(example, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=/);
});
