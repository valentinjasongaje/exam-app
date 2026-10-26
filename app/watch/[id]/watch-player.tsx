"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { playerBridge } from "@/lib/player-bridge";

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
}: {
  videoId: string;
  fileId: string;
  title: string;
  startAt: number | null;
}) {
  const [mode, setMode] = useState<Mode>("loading");
  const video = useRef<HTMLVideoElement>(null);
  const lastSaved = useRef(0);

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
          onError={() => setMode("drive")}
          className="absolute inset-0 h-full w-full bg-black"
        />
      )}
    </div>
  );
}
