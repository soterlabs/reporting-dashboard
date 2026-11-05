"use client";
import { Moon, Sun, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function Controls() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dark, setDark] = useState(false);
  return (
    <div className="controls">
      <button
        className="icon-button"
        aria-label="Refresh reporting data"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RefreshCw size={16} className={pending ? "spinning" : ""} />
      </button>
      <button
        className="icon-button"
        aria-label="Toggle color theme"
        onClick={() => {
          const next = document.documentElement.dataset.theme !== "dark";
          document.documentElement.dataset.theme = next ? "dark" : "light";
          setDark(next);
          try {
            localStorage.setItem("theme", next ? "dark" : "light");
          } catch {}
        }}
      >
        {dark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
    </div>
  );
}


export function ReportingMonthSelect({ months, value }: {
  months: { key: string; label: string; state: string }[]; value: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <label className="period-form">
    <span>Reporting month</span>
    <select aria-label="Reporting month" value={value} disabled={pending} onChange={event => {
      const url = new URL(window.location.href);
      url.searchParams.set("year", "2026");
      url.searchParams.set("month", event.target.value);
      startTransition(() => router.push(url.pathname + url.search));
    }}>
      {months.map(month => <option key={month.key} value={month.key}>{month.label} 2026{month.state === "partial" ? " · MTD" : ""}</option>)}
    </select>
  </label>;
}
