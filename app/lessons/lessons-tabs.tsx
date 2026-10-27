"use client";

import { Library, ListChecks, PlayCircle } from "lucide-react";
import SectionTabs from "@/components/section-tabs";

export default function LessonsTabs() {
  return (
    <SectionTabs
      tabs={[
        { href: "/lessons", label: "Videos", icon: PlayCircle, exact: true },
        { href: "/lessons/topics", label: "Topics", icon: ListChecks },
        { href: "/lessons/library", label: "Library", icon: Library },
      ]}
    />
  );
}
