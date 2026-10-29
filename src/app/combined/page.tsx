import { redirect } from "next/navigation";
import type { Search } from "@/components/prime-dashboard";
import { individualReportHref, parsePrime } from "@/lib/prime-reports";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  const prime =
    parsePrime(typeof search.prime === "string" ? search.prime : null) ||
    "spark";
  redirect(individualReportHref(prime, search));
}
