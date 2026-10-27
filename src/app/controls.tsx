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
