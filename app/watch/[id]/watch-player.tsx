"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { playerBridge } from "@/lib/player-bridge";
import { watchProgress } from "@/lib/watch-progress-store";
import { BUCKET_SECONDS } from "@/lib/watch-coverage-shared";

type Mode = "loading" | "native" | "drive";

/** Registers the Drive streaming worker and waits until it controls this page. */
async function ensureWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("no service worker");
  await navigator.serviceWorker.register("/drive-sw.js");
  if (navigator.serviceWorker.controller) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("worker not ready")), 5000);
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true }
    );
  });
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
  const video = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(0);
  const router = useRouter();

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
    watchProgress.set({ share: initialShare, completed: initialCompleted, justCompleted: false, tracking: false });
  }, [initialShare, initialCompleted]);

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
      .catch(() => alive && setMode("drive"));
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

  if (mode === "drive") {
    return (
      <div>
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
          Drive&rsquo;s player: timestamps can&rsquo;t be read here.
          <button type="button" onClick={() => location.reload()} className="text-accent hover:underline">
            Try the built-in player
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full">
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
          onError={() => setMode("drive")}
          className="absolute inset-0 h-full w-full bg-black"
        />
      )}
    </div>
  );
}
