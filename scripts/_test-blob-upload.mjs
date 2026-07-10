import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { put } from "@vercel/blob";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

for (const file of [".env", ".env.local"]) {
  const filePath = path.join(projectRoot, file);
  if (!fs.existsSync(filePath)) continue;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const match = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (match) process.env[match[1]] = match[2];
  }
}

console.log("BLOB_STORE_ID:", process.env.BLOB_STORE_ID);
console.log("VERCEL_OIDC_TOKEN present:", !!process.env.VERCEL_OIDC_TOKEN);

const buffer = Buffer.from("hello blob test", "utf-8");
const blob = await put(`test-${Date.now()}.txt`, buffer, {
  access: "public",
  contentType: "text/plain",
  addRandomSuffix: false,
});

console.log("Uploaded:", blob.url);
