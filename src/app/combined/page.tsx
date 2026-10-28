import { PrimeDashboard, type Search } from "@/components/prime-dashboard";
import { parsePrime } from "@/lib/prime-reports";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const search = await searchParams;
  return (
    <PrimeDashboard
      prime={
        parsePrime(typeof search.prime === "string" ? search.prime : null) ||
        "spark"
      }
      combined
      search={search}
    />
  );
}
