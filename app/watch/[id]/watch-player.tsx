"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, RotateCw } from "lucide-react";
import { clsx } from "clsx";
import { playerBridge } from "@/lib/player-bridge";
import { watchProgress } from "@/lib/watch-progress-store";
import { BUCKET_SECONDS } from "@/lib/watch-coverage-shared";

type Mode = "loading" | "native" | "drive";

const RELOAD_KEY = "player-helper-reloaded";

function waitForController(ms: number) {
  return new Promise<boolean>((resolve) => {
    if (navigator.serviceWorker.controller) return resolve(true);
    const t = setTimeout(() => resolve(!!navigator.serviceWorker.controller), ms);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        clearTimeout(t);
        resolve(true);
      },
      { once: true }
    );
  });
}

/**
 * Registers the Drive streaming worker and makes sure it controls this page.
 * A page that was opened before the worker became active (an old tab, a
 * page loaded before the first visit to a video, or Ctrl+Shift+R) isn't
 * controlled automatically: ask the worker to claim it, and as a last
 * resort reload once (a normal reload always comes back controlled).
 */
async function ensureWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("This browser can't run the built-in player (no service workers). Try Chrome, Edge or Safari, outside private mode.");
  const reg = await navigator.serviceWorker.register("/drive-sw.js");
  reg.update().catch(() => {});
  if (navigator.serviceWorker.controller) return;

  // Wait for an active worker (first install takes a moment), then ask it to take this page.
  const ready = await Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 10000))]);
  if (ready?.active) ready.active.postMessage("claim");
  if (await waitForController(4000)) {
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {}
    return;
  }

  // Still not in control: one automatic normal reload per tab session.
  let reloaded = false;
  try {
    reloaded = sessionStorage.getItem(RELOAD_KEY) === "1";
    if (!reloaded) sessionStorage.setItem(RELOAD_KEY, "1");
  } catch {
    reloaded = true;
  }
  if (!reloaded) {
    location.reload();
    await new Promise(() => {}); // the page is going away
  }
  throw new Error("The player helper didn't start. Close this tab and open the video again.");
}

const posKey = (id: string) => `watch-pos:${id}`;

/**
 * The site's own video player, streaming the file from the user's Drive
 * through a service worker. Unlike Drive's embedded player it lets the notes
 * read the current time ("Add timestamp") and jump to a time. Falls back to
 * Drive's player if the browser can't (no service worker, unsupported codec,
 * hard refresh); timestamps then can't be read.
 */
export default function WatchPlayer({
  videoId,
  fileId,
  title,
  startAt,
  initialShare,
  initialCompleted,
}: {
  videoId: string;
  fileId: string;
  title: string;
  startAt: number | null;
  initialShare: number;
  initialCompleted: boolean;
}) {
  const [mode, setMode] = useState<Mode>("loading");
  const [reason, setReason] = useState<string | null>(null);
  const retried = useRef(false);
  const video = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(0);
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);

  // ---- automatic watch tracking ----
  // Which 10-second stretches were really played, and how much real time
  // was spent playing; sent to the server every 30 s and when pausing or
  // leaving, so the tracker fills in on its own.
  const pending = useRef(new Set<number>());
  const played = useRef(0);
  const lastT = useRef(0);
  const lastWall = useRef(0);

  function flush(leaving = false) {
    if (pending.current.size === 0 && played.current < 1) return;
    const body = JSON.stringify({ videoId, buckets: [...pending.current], played: Math.round(played.current) });
    pending.current.clear();
    played.current = 0;
    fetch("/api/watch/progress", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { share: number; completed: boolean; justCompleted: boolean } | null) => {
        if (!d || leaving) return;
        watchProgress.set({ share: d.share, completed: d.completed, justCompleted: d.justCompleted || watchProgress.get().justCompleted });
        if (d.justCompleted) router.refresh(); // updates the Watched checkbox
      })
      .catch(() => {});
  }

  useEffect(() => {
    watchProgress.set({ share: initialShare, completed: initialCompleted, justCompleted: false, tracking: false, mode: "loading" });
  }, [initialShare, initialCompleted]);

  useEffect(() => {
    watchProgress.set({ mode });
  }, [mode]);

  useEffect(() => {
    if (mode !== "native") return;
    watchProgress.set({ tracking: true });
    const beat = setInterval(() => flush(), 30_000);
    const leave = () => flush(true);
    const hidden = () => document.visibilityState === "hidden" && flush(true);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(beat);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", hidden);
      flush(true);
      watchProgress.set({ tracking: false });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const track = () => {
    const v = video.current;
    if (!v || v.paused || v.seeking) return;
    const now = performance.now();
    const t = v.currentTime;
    const dt = (now - lastWall.current) / 1000;
    const dv = t - lastT.current;
    // Normal playback only: skips and jumps don't count as watched.
    if (lastWall.current && dt > 0 && dt < 3 && dv > 0 && dv < 6) {
      played.current += dt;
      for (let b = Math.floor(lastT.current / BUCKET_SECONDS); b <= Math.floor(t / BUCKET_SECONDS); b++) pending.current.add(b);
    }
    lastWall.current = now;
    lastT.current = t;
  };
  const resetTrack = () => {
    lastWall.current = 0;
  };

  useEffect(() => {
    let alive = true;
    ensureWorker()
      .then(() => alive && setMode("native"))
      .catch((e: Error) => {
        if (!alive) return;
        setReason(e.message);
        setMode("drive");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== "native") return;
    playerBridge.set({
      getTime: () => video.current?.currentTime ?? 0,
      seek: (s) => {
        const v = video.current;
        if (!v) return;
        v.currentTime = s;
        v.play().catch(() => {});
      },
      // The video is same-origin (served through the worker), so the canvas isn't tainted.
      captureFrame: async () => {
        const v = video.current;
        if (!v || !v.videoWidth) return null;
        const scale = Math.min(1, 1600 / v.videoWidth);
        const c = document.createElement("canvas");
        c.width = Math.round(v.videoWidth * scale);
        c.height = Math.round(v.videoHeight * scale);
        c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
        return new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.85));
      },
      skip: (d) => skipBy(d),
      getRate: () => video.current?.playbackRate ?? 1,
      setRate: (r) => {
        if (video.current) video.current.playbackRate = r;
        try {
          localStorage.setItem("watch-rate", String(r));
        } catch {
          /* private mode */
        }
      },
    });
    return () => playerBridge.set(null);
  }, [mode]);

  // Resume where you left off (or at ?t= from a note's timestamp).
  const onLoaded = () => {
    const v = video.current;
    if (!v) return;
    let at = startAt;
    if (at === null) {
      try {
        at = Number(localStorage.getItem(posKey(videoId))) || null;
      } catch {
        at = null;
      }
    }
    if (at && at < v.duration - 5) v.currentTime = at;
    try {
      const rate = Number(localStorage.getItem("watch-rate"));
      if (rate) v.playbackRate = rate;
    } catch {
      /* private mode */
    }
  };

  const onTime = () => {
    track();
    const v = video.current;
    if (!v || Math.abs(v.currentTime - lastSaved.current) < 5) return;
    lastSaved.current = v.currentTime;
    try {
      localStorage.setItem(posKey(videoId), String(Math.floor(v.currentTime)));
    } catch {
      /* private mode */
    }
  };

  // Find out why the video didn't load (the worker passes Google's error through), retry once, then fall back.
  async function onVideoError() {
    const code = video.current?.error?.code;
    let why = code === 4 ? "This video's format can't play in this browser." : "The video didn't load.";
    try {
      const r = await fetch(`/drive-media/${fileId}`, { headers: { Range: "bytes=0-1" }, cache: "no-store" });
      if (!r.ok) {
        const d = await r.json().catch(() => null);
        const msg: string = d?.error?.message ?? d?.error ?? "";
        why =
          r.status === 401
            ? "The video library's Google Drive access expired. The admin needs to reconnect Drive (Lessons → Videos)."
            : r.status === 403
              ? `Google Drive refused the file (403)${msg ? `: ${msg}` : ""}.`
              : r.status === 404
                ? "The file isn't on your Drive any more (404). Re-upload it from the Video checklist."
                : `Google Drive error ${r.status}${msg ? `: ${msg}` : ""}`;
      } else if (code !== 4 && !retried.current) {
        // The file is reachable: likely a hiccup. Try once more before giving up.
        retried.current = true;
        video.current?.load();
        return;
      }
    } catch {
      why = "Couldn't reach Google Drive. Check your connection.";
    }
    setReason(why);
    setMode("drive");
  }

  // ---- skipping: buttons, keyboard (← → / J L, Shift = 30 s, K or space = play/pause), double-tap ----
  const [flash, setFlash] = useState<{ side: "back" | "fwd"; n: number; key: number } | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function skipBy(delta: number) {
    const v = video.current;
    if (!v) return;
    const end = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.min(end, Math.max(0, v.currentTime + delta));
    // Stack quick repeats: "−20s", "−30s"…
    setFlash((f) => {
      const side = delta < 0 ? "back" : "fwd";
      const n = f && f.side === side ? f.n + Math.abs(delta) : Math.abs(delta);
      return { side, n, key: Date.now() };
    });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 650);
  }

  function togglePlay() {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  useEffect(() => {
    if (mode !== "native") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const step = e.shiftKey ? 30 : 10;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "j") skipBy(-step);
      else if (k === "arrowright" || k === "l") skipBy(step);
      else if (k === "k" || (k === " " && (t === document.body || t?.tagName === "VIDEO"))) togglePlay();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // Capture phase, so the video element's own 5-second arrow handling doesn't also run.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
     
  }, [mode]);

  // Double-tap the left or right side to go back or forward 10 s; a single tap plays/pauses.
  function onZoneTap(side: "back" | "fwd") {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      skipBy(side === "back" ? -10 : 10);
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      togglePlay();
    }, 260);
  }

  // Publishes the pinned player's height as --player-h, so things pinned under it
  // on phones (the notes tabs) sit just below it whatever is showing.
  useEffect(() => {
    const box = rootRef.current?.parentElement;
    if (!box) return;
    const set = () => document.documentElement.style.setProperty("--player-h", `${box.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(box);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--player-h");
    };
  }, [mode]);

  if (mode === "drive") {
    return (
      <div ref={rootRef}>
        <div className="relative aspect-video w-full">
          <iframe
            src={`https://drive.google.com/file/d/${fileId}/preview`}
            title={title}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        </div>
        <p className="flex flex-wrap items-center gap-x-2 bg-bg-muted px-3 py-1.5 text-xs text-ink-muted">
          <span>
            Using Drive&rsquo;s player, so no auto-tracking or timestamps.
            {reason && <span className="block text-danger">Why: {reason}</span>}
          </span>
          <button type="button" onClick={() => location.reload()} className="text-accent hover:underline">
            Try the built-in player
          </button>
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative aspect-video w-full">
      {mode === "loading" ? (
        <div className="absolute inset-0 flex items-center justify-center text-white/70">
          <Loader2 className="animate-spin" />
        </div>
      ) : (
        <video
          ref={video}
          src={`/drive-media/${fileId}`}
          title={title}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={onLoaded}
          onTimeUpdate={onTime}
          onSeeking={resetTrack}
          onPlay={resetTrack}
          onPause={() => {
            resetTrack();
            flush();
          }}
          onEnded={() => flush()}
          onError={() => void onVideoError()}
          className="absolute inset-0 h-full w-full bg-black"
        />
      )}
      {mode === "native" && (
        <>
          {/* Double-tap zones; they stop above the control bar and leave the middle for the play button. */}
          {(["back", "fwd"] as const).map((side) => (
            <button
              key={side}
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => onZoneTap(side)}
              className={clsx("absolute top-0 bottom-14 w-[35%] cursor-default", side === "back" ? "left-0" : "right-0")}
            />
          ))}
          {flash && (
            <div
              key={flash.key}
              className={clsx(
                "animate-fade pointer-events-none absolute top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full bg-black/55 px-4 py-3 text-xs font-medium text-white",
                flash.side === "back" ? "left-[12%]" : "right-[12%]"
              )}
            >
              {flash.side === "back" ? <RotateCcw size={22} /> : <RotateCw size={22} />}
              {flash.side === "back" ? "−" : "+"}
              {flash.n}s
            </div>
          )}
        </>
      )}
    </div>
  );
}
