/**
 * Links that open a review video in the user's own video player.
 *
 * Browsers won't open local files (G:\...) from a website, so the laptop has
 * a tiny "ecevideo:" link handler installed once (G:\ECE Video Opener, see
 * tools/video-opener). The link carries the path *relative to the drive*,
 * and the handler only opens .mp4 files inside the two review folders, so a
 * link can't be used to run anything else.
 */

export const VIDEO_PROTOCOL = "ecevideo";

export function openVideoHref(localPath: string) {
  const relative = localPath.replace(/^[A-Za-z]:\\/, "");
  return `${VIDEO_PROTOCOL}:open?path=${encodeURIComponent(relative)}`;
}
