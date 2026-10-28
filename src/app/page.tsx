import { redirect } from "next/navigation";
import { parsePrime } from "@/lib/prime-reports";
import type { Search } from "@/components/prime-dashboard";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const s = await searchParams;
  const prime =
    parsePrime(typeof s.prime === "string" ? s.prime : null) || "spark";
  const q = new URLSearchParams();
  for (const key of ["scope", "view", "year", "month"])
    if (typeof s[key] === "string") q.set(key, s[key] as string);
  redirect(`/primes/${prime}${q.size ? `?${q}` : ""}`);
}
