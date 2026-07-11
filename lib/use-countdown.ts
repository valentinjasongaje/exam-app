"use client";

import { useEffect, useState } from "react";

export function useCountdown(deadline: string | null) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!deadline) return;
    // Set the real clock only after mount (not as lazy initial state) so the
    // server-rendered placeholder matches the client's first render — the
    // exact "now" moment isn't available/deterministic during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline || now === null) {
    return { ready: false, expired: false, label: null as string | null };
  }

  const remainingMs = Math.max(0, new Date(deadline).getTime() - now);
  const expired = remainingMs <= 0;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const label = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return { ready: true, expired, label };
}
