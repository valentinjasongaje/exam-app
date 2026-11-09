/**
 * One-off: changes saved picture links from the bucket's address
 * (R2_PUBLIC_URL + "/file.png") to the app's own path ("/img/file.png"), so
 * pictures load through the app (see lib/image-url.ts, next.config.ts).
 * Only rows whose link starts with R2_PUBLIC_URL are touched. Safe to re-run.
 *
 *   npx tsx scripts/links-to-img-path.ts [--dry-run]
 *
 * Deploy the rewrite first, or the pictures show broken until it is live.
 */
import fs from "fs";

for (const file of [".env.local", ".env"]) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][\w]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])([\s\S]*)\1$/, "$2");
  }
}

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const base = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new Error("R2_PUBLIC_URL is missing.");
  const { prisma } = await import("../lib/prisma");

  const targets: [table: string, column: string][] = [
    ["Question", "imageUrl"],
    ["Question", "explanationImageUrl"],
    ["VideoQuestion", "imageUrl"],
    ["VideoQuestion", "solutionImageUrl"],
  ];
  const like = `${base}/%`;
  const cut = base.length + 2; // SQL substr is 1-based: skip "<base>/"
  let total = 0;
  for (const [table, column] of targets) {
    const [{ n }] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*) AS n FROM "${table}" WHERE "${column}" LIKE $1`, like);
    total += Number(n);
    if (dryRun) {
      console.log(`${table}.${column}: ${n} links would change`);
    } else {
      const done = await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = '/img/' || substr("${column}", ${cut}) WHERE "${column}" LIKE $1`, like);
      console.log(`${table}.${column}: ${done} links changed`);
    }
  }
  console.log(dryRun ? `\nDry run: ${total} links would change, nothing written.` : `\nDone: ${total} links now use /img/.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
