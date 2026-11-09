/**
 * Pictures on R2 are saved as "/img/<file>" and served through this app
 * (next.config.ts rewrites /img/* to the bucket), because some networks can't
 * resolve the bucket's r2.dev address. The AI needs a full https address it can
 * fetch itself, so this turns a saved link into one.
 */
export const IMG_PREFIX = "/img/";

export function publicImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith(IMG_PREFIX)) return url;
  const base = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/${url.slice(IMG_PREFIX.length)}` : null;
}
