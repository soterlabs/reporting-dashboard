import { notFound, redirect } from "next/navigation";
import { PrimeDashboard, type Search } from "@/components/prime-dashboard";
import { individualReportHref, parsePrime } from "@/lib/prime-reports";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ prime: string }>;
  searchParams: Promise<Search>;
}) {
  const prime = parsePrime((await params).prime);
  if (!prime) notFound();
  const search = await searchParams;
  if (search.scope === "combined" || search.scope === "group")
    redirect(individualReportHref(prime, search));
  return <PrimeDashboard prime={prime} search={search} />;
}
