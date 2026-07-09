/**
 * Aplica a migration inicial via Management API (requer token da conta certa).
 *
 * Uso:
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."
 *   node scripts/apply-migration.mjs
 *
 * Alternativa sem token: cole o SQL de
 *   supabase/migrations/20260709120000_init_tracking.sql
 * no SQL Editor do Dashboard do projeto tdgaitwvakzztcbodwfm.
 *
 * NÃO use o MCP Supabase deste Cursor (conta/org errada).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_REF = "tdgaitwvakzztcbodwfm";
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error(
    "Defina SUPABASE_ACCESS_TOKEN (Dashboard → Account → Access Tokens) da conta dona do projeto tdgaitwvakzztcbodwfm.\n" +
      "Ou cole a migration no SQL Editor."
  );
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(
  __dirname,
  "../supabase/migrations/20260709120000_init_tracking.sql"
);
const query = readFileSync(sqlPath, "utf8");

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  }
);

const body = await res.text();
if (!res.ok) {
  console.error("Falha ao aplicar SQL:", res.status, body);
  process.exit(1);
}
console.log("Migration aplicada:", body.slice(0, 500));
