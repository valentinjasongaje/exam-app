import { put } from "@vercel/blob";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Where pictures are stored. With the R2_* variables set they go to a public
 * Cloudflare R2 bucket (S3-compatible, no charge for downloads); otherwise
 * the old Vercel Blob store is used.
 *
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
 *   R2_PUBLIC_URL  (the bucket's public address, e.g. https://pub-xxxx.r2.dev)
 */
export const usesR2 = () =>
  Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_URL);

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
  if (usesR2()) {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: filename,
        Body: buffer,
        ContentType: mime,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );
    return `${process.env.R2_PUBLIC_URL!.replace(/\/+$/, "")}/${filename}`;
  }
  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
  });
  return blob.url;
}
