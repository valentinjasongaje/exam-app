"use client";

import { BarChart3, Timer } from "lucide-react";
import SectionTabs from "@/components/section-tabs";

export default function ProgressTabs() {
  return (
    <SectionTabs
      tabs={[
        { href: "/stats", label: "Scores", icon: BarChart3 },
        { href: "/tracker", label: "Study log", icon: Timer },
      ]}
    />
  );
}
