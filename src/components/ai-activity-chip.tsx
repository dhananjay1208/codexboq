"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

const STORAGE_KEY = "boqai.aiActivity";
const MINUTES_PER_AI_CALL = 4;

type Activity = {
  date: string;
  calls: number;
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readActivity(): Activity {
  if (typeof window === "undefined") {
    return { date: todayKey(), calls: 0 };
  }

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Activity>;
    const today = todayKey();

    if (parsed.date !== today) {
      return { date: today, calls: 0 };
    }

    return { date: today, calls: Number(parsed.calls) || 0 };
  } catch {
    return { date: todayKey(), calls: 0 };
  }
}

function writeActivity(activity: Activity) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(activity));
  window.dispatchEvent(new CustomEvent("boqai-ai-activity"));
}

export function AiActivityChip() {
  const [activity, setActivity] = useState<Activity>({ date: todayKey(), calls: 0 });

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (url.includes("/api/ai/")) {
        const current = readActivity();
        writeActivity({ date: current.date, calls: current.calls + 1 });
      }

      return response;
    };

    function syncActivity() {
      setActivity(readActivity());
    }

    queueMicrotask(syncActivity);
    window.addEventListener("boqai-ai-activity", syncActivity);
    window.addEventListener("storage", syncActivity);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener("boqai-ai-activity", syncActivity);
      window.removeEventListener("storage", syncActivity);
    };
  }, []);

  const minutesSaved = activity.calls * MINUTES_PER_AI_CALL;

  return (
    <div className="fixed right-6 top-5 z-30 hidden items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-medium text-slate-100 shadow-[0_0_28px_rgba(59,130,246,0.16)] backdrop-blur-xl md:flex">
      <Bot className="size-3.5 text-[var(--accent)]" />
      <span>{activity.calls} AI calls today</span>
      <span className="text-slate-500">/</span>
      <span className="text-blue-200">saved {minutesSaved} minutes</span>
    </div>
  );
}
