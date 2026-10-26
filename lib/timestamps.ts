/** "[12:34]" / "[1:02:03]" timestamps inside note text. */

export function formatTime(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export function parseTime(t: string) {
  const parts = t.split(":").map(Number);
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

const LINE = /^\s*\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]\s*(.*)$/;

/** Lines that start with a timestamp, in the order written. */
export function parseTimeline(body: string) {
  return body
    .split("\n")
    .map((line) => line.match(LINE))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ label: m[1], seconds: parseTime(m[1]), text: m[2] }));
}

/** Splits text into plain parts and timestamp parts, for rendering clickable times. */
export function splitTimestamps(text: string) {
  const out: ({ kind: "text"; value: string } | { kind: "time"; label: string; seconds: number })[] = [];
  const re = /\[((?:\d{1,2}:)?\d{1,2}:\d{2})\]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    out.push({ kind: "time", label: m[1], seconds: parseTime(m[1]) });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}
