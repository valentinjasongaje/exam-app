// Rebuilds the "plan" in lib/video-library.json from the recordings on the G:\ drive.
//
//   node scripts/build-video-plan.mjs            # scan, write lib/video-library.json
//   node scripts/build-video-plan.mjs --dry-run  # scan and report only
//
// Reads every .mp4 under `Excel Review Center\OCTOBER 2025` (read-only; durations come from
// each file's 'mvhd' atom, no ffmpeg needed). One plan video per FILE, so a lecture that was
// recorded in six parts becomes six plan videos that share one topic (and so one note, one set
// of formulas, one pool of questions/markers; see lib/video-parts.ts). Every version
// (V1/V2/V3, "ECE Math", GEAS 03's two "Part" folders) is kept. All refreshers, from all four
// subjects, go in one "refresher" section. `library` and `stats` are left as they are.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = "G:\\Excel Review Center\\OCTOBER 2025";
const JSON_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "video-library.json");
const DRY = process.argv.includes("--dry-run");

const SUBJECT_ORDER = ["math", "geas", "elex", "est"];
const DEFAULT_CODE = { math: "Math", geas: "GEAS", elex: "Elec", est: "EST" };

function durationSeconds(file) {
  const fd = fs.openSync(file, "r");
  try {
    const size = fs.fstatSync(fd).size;
    const hdr = Buffer.alloc(16);
    let pos = 0;
    while (pos + 8 <= size) {
      fs.readSync(fd, hdr, 0, 16, pos);
      let boxSize = hdr.readUInt32BE(0);
      const type = hdr.toString("latin1", 4, 8);
      let header = 8;
      if (boxSize === 1) { boxSize = Number(hdr.readBigUInt64BE(8)); header = 16; }
      if (boxSize === 0) boxSize = size - pos;
      if (type === "moov") {
        const buf = Buffer.alloc(Math.min(boxSize - header, 4 * 1024 * 1024));
        fs.readSync(fd, buf, 0, buf.length, pos + header);
        const i = buf.indexOf("mvhd");
        if (i < 0) return null;
        const base = i + 8;
        return buf[i + 4] === 1
          ? Number(buf.readBigUInt64BE(base + 20)) / buf.readUInt32BE(base + 16)
          : buf.readUInt32BE(base + 12) / buf.readUInt32BE(base + 8);
      }
      if (boxSize < header) return null;
      pos += boxSize;
    }
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.mp4$/i.test(e.name)) yield p;
  }
}

// "<code> <no> - <topic> [vN] Part <k>.mp4"
const NAME = /^(?<code>[A-Za-z]+)\s+(?<no>\d+)\s*-\s*(?<topic>.*?)\s*(?:\b[vV](?<v>\d+)\s*)?Part\s*(?<part>\d+)\.mp4$/i;

const pad2 = (n) => String(n).padStart(2, "0");
/** "MATH"/"math" → "Math", "ELEC" → "Elec", everything else upper-case (EST, GEAS, ESAS). */
const normCode = (raw) => {
  const u = raw.toUpperCase();
  return u === "MATH" ? "Math" : u === "ELEC" ? "Elec" : u;
};

const entries = [];
const problems = [];

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).split(path.sep);
  const name = rel[rel.length - 1];
  const m = NAME.exec(name);
  if (!m) { problems.push(`unparsed name: ${rel.join("\\")}`); continue; }
  const subject = rel[0].toLowerCase();
  if (!SUBJECT_ORDER.includes(subject)) { problems.push(`unknown subject folder: ${rel.join("\\")}`); continue; }
  const isRefresher = rel[1].toLowerCase() === "refresher";
  const dirs = rel.slice(1, -1);

  // Which recording of the lecture this is: folder version > file-name version > Part-folder set > ECE Math.
  const folderV = dirs.find((d) => /^V\d+$/i.test(d));
  const setDir = dirs.find((d) => /^Part \d+$/i.test(d));
  const variant = folderV
    ? folderV.toUpperCase()
    : m.groups.v
      ? `V${m.groups.v}`
      : setDir
        ? `Set ${setDir.match(/\d+/)[0]}`
        : dirs.some((d) => /^ECE Math$/i.test(d))
          ? "ECE Math"
          : "";

  let code, topicNo, topic;
  if (isRefresher) {
    // Slot comes from the file name ("ESAS 01 - Refresher 1"): GEAS has both an ESAS and a GEAS series
    // with overlapping numbers, so a series that isn't the subject's own code keeps its code in the topic.
    code = normCode(m.groups.code);
    topicNo = Number(m.groups.no);
    topic = code === DEFAULT_CODE[subject] ? `Refresher ${topicNo}` : `${code} Refresher ${topicNo}`;
  } else {
    // Slot comes from the folder, so a mislabelled file ("Math 04" inside "Math 3") still lands in the right lecture.
    const fm = /^(?<code>[A-Za-z]+)\s*(?<no>\d+)\s*-?\s*(?<rest>.*)$/.exec(dirs[0]);
    if (!fm) { problems.push(`unparsed folder: ${rel.join("\\")}`); continue; }
    code = normCode(fm.groups.code);
    topicNo = Number(fm.groups.no);
    topic = fm.groups.rest.trim() || null; // folders like "Math 1" carry no topic text: taken from the file names below
  }

  const stat = fs.statSync(file);
  const secs = durationSeconds(file);
  if (secs == null) { problems.push(`no duration: ${rel.join("\\")}`); continue; }
  entries.push({
    section: isRefresher ? "refresher" : "core",
    subject,
    code,
    topicNo,
    topic, // may be null until the slot's name is known
    fileTopic: m.groups.topic.trim(),
    variant,
    part: Number(m.groups.part),
    file: name,
    localPath: file,
    minutes: Math.max(1, Math.round(secs / 60)),
    bytes: stat.size,
  });
}

// Slots whose folder has no topic text ("Math 1", "Elec 01"): use the file name's topic.
const slotName = new Map();
for (const e of entries) {
  if (e.topic) continue;
  const key = `${e.subject}|${e.code}|${e.topicNo}`;
  if (!slotName.has(key)) slotName.set(key, e.fileTopic);
}
for (const e of entries) if (!e.topic) e.topic = slotName.get(`${e.subject}|${e.code}|${e.topicNo}`);

// Exact duplicates (same size and length in different folders) would just be uploaded twice.
const seen = new Map();
const dupes = [];
const unique = [];
for (const e of entries) {
  const sig = `${e.bytes}|${e.minutes}`;
  if (seen.has(sig)) { dupes.push(`${e.localPath}  ==  ${seen.get(sig)}`); continue; }
  seen.set(sig, e.localPath);
  unique.push(e);
}

const variantRank = (v) => (v === "" ? 0 : v === "ECE Math" ? 1 : /^V\d+$/.test(v) ? 10 + Number(v.slice(1)) : 30 + Number(v.replace(/\D/g, "")));
unique.sort(
  (a, b) =>
    (a.section === b.section ? 0 : a.section === "core" ? -1 : 1) ||
    SUBJECT_ORDER.indexOf(a.subject) - SUBJECT_ORDER.indexOf(b.subject) ||
    a.code.localeCompare(b.code) ||
    a.topicNo - b.topicNo ||
    variantRank(a.variant) - variantRank(b.variant) ||
    a.part - b.part
);

// (slot, variant, part) must be unique, or two plan videos would share a title.
const keys = new Set();
const plan = unique.map((e) => {
  const title = `${e.code} ${pad2(e.topicNo)} · ${e.topic} — ${e.variant ? `${e.variant} · ` : ""}Part ${e.part}`;
  if (keys.has(title)) problems.push(`duplicate title: ${title}`);
  keys.add(title);
  return {
    section: e.section,
    subject: e.subject,
    topicNo: e.topicNo,
    title,
    file: e.file,
    localPath: e.localPath,
    minutes: e.minutes,
    bytes: e.bytes,
    part: e.part,
    ...(e.variant ? { variant: e.variant } : {}),
  };
});

const hours = (min) => (min / 60).toFixed(1);
const total = plan.reduce((s, p) => s + p.minutes, 0);
console.log(`videos: ${plan.length}  (${hours(total)} h, ${(plan.reduce((s, p) => s + p.bytes, 0) / 1024 ** 3).toFixed(1)} GB)`);
for (const section of ["core", "refresher"]) {
  const rows = plan.filter((p) => p.section === section);
  const topics = new Set(rows.map((p) => p.title.split(" — ")[0]));
  console.log(`  ${section.padEnd(9)} ${String(rows.length).padStart(3)} videos, ${String(topics.size).padStart(2)} topics, ${hours(rows.reduce((s, p) => s + p.minutes, 0))} h`);
}
console.log(`exact duplicates skipped: ${dupes.length}`);
for (const d of dupes) console.log("  ", d);
console.log(`problems: ${problems.length}`);
for (const p of problems) console.log("  ", p);

if (problems.length) { console.error("not writing: fix the problems above first"); process.exit(1); }
if (DRY) { console.log("dry run: nothing written"); process.exit(0); }

const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
data.plan = plan;
data.planSource = { folder: "OCTOBER 2025", scannedOn: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(JSON_PATH, JSON.stringify(data));
console.log("wrote", JSON_PATH);
