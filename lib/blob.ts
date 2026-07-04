import { put } from "@vercel/blob";

/** Uploads an image buffer to Vercel Blob and returns its public URL. */
export async function uploadImage(
  buffer: Buffer,
  filename: string,
  mime: string
): Promise<string> {
  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mime,
    addRandomSuffix: false,
  });
  return blob.url;
}
