"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

// Refresh server data without resetting filters, scroll or expanded rows.
export function ReportingRefresh() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const lastRefresh = useRef(0);
  useEffect(() => {
    busy.current = pending;
  }, [pending]);
  useEffect(() => {
    function refresh() {
      if (
        document.visibilityState !== "visible" ||
        busy.current ||
        Date.now() - lastRefresh.current < 5000
      )
        return;
      lastRefresh.current = Date.now();
      busy.current = true;
      startTransition(() => router.refresh());
    }
    const timer = window.setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, [router]);
  return null;
}
