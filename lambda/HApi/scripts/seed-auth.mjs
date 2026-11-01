/**
 * 将应用账号写入 DynamoDB（scrypt 哈希）。
 * 用法（在 lambda/HApi 目录）：
 *   node scripts/seed-auth.mjs
 * 读 .env.secrets 的 HUMANITY_*，并写入 Cycle 固定账号。
 */
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { putCredential } from "../lib/appAuth.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadSecrets() {
  const out = {};
  const p = join(root, ".env.secrets");
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const sec = loadSecrets();
const humanityEmail =
  process.env.HUMANITY_EMAIL || sec.HUMANITY_EMAIL || "";
const humanityPassword =
  process.env.HUMANITY_PASSWORD || sec.HUMANITY_PASSWORD || "";
const cycleEmail =
  process.env.CYCLE_EMAIL || sec.CYCLE_EMAIL || "capitalism4418@gmail.com";
const cyclePassword =
  process.env.CYCLE_PASSWORD || sec.CYCLE_PASSWORD || "Dollar00";

if (!humanityEmail || !humanityPassword) {
  console.error("missing HUMANITY_EMAIL / HUMANITY_PASSWORD for seed");
  process.exit(1);
}

await putCredential("humanity", humanityEmail, humanityPassword);
console.log("seeded humanity", humanityEmail);

await putCredential("cycle", cycleEmail, cyclePassword);
console.log("seeded cycle", cycleEmail);

console.log("done");
