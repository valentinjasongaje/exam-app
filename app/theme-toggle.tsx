"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    const initial: Theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    // Read after mount (not a lazy initial-state) so the server-rendered
    // placeholder matches the client's first render — localStorage isn't
    // available during SSR, and guessing here would cause a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
  }, []);

  useEffect(() => {
    if (!theme) return;
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((theme === "dark" ? "light" : "dark"))}
      aria-label="Toggle theme"
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-bg-muted hover:text-ink"
    >
      {theme === null ? null : theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
