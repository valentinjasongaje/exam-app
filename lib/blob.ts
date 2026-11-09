import { put } from "@vercel/blob";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { IMG_PREFIX } from "@/lib/image-url";

/**
 * Where pictures are stored. With the R2_* variables set they go to a public
 * Cloudflare R2 bucket (S3-compatible, no charge for downloads); otherwise
 * the old Vercel Blob store is used.
 *
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 *   R2_PUBLIC_URL  (the bucket's public address, e.g. https://pub-xxxx.r2.dev)
 */
const R2_VARS = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL"] as const;

export const usesR2 = () => R2_VARS.every((k) => Boolean(process.env[k]?.trim()));

/** Names of R2 settings that are missing, when some but not all are set (a typo or a forgotten variable). */
const missingR2 = () => {
  const missing = R2_VARS.filter((k) => !process.env[k]?.trim());
  return missing.length > 0 && missing.length < R2_VARS.length ? missing : [];
};

let r2: S3Client | null = null;
function r2Client() {
  return (r2 ??= new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
  }));
}

/** Uploads an image buffer and returns its public URL. */
export async function uploadImage(
  buffer: Buffer,
  filename: string,
  mime: string
): Promise<string> {
  const missing = missingR2();
  if (missing.length) throw new Error(`Picture storage (R2) is not fully set up: missing ${missing.join(", ")}.`);
  if (usesR2()) {
    try {
      await r2Client().send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET!.trim(),
          Key: filename,
          Body: buffer,
          ContentType: mime,
          CacheControl: "public, max-age=31536000, immutable",
        })
      );
    } catch (e) {
      const err = e as { name?: string; message?: string };
      console.error("R2 upload failed", e);
      throw new Error(`R2 upload failed (${err.name ?? "error"}): ${err.message ?? "unknown"}`);
    }
    return `${IMG_PREFIX}${filename}`; // served through the app, see lib/image-url.ts
  }
  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
  });
  return blob.url;
}
