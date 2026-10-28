import { notFound } from "next/navigation";
import { PrimeDashboard, type Search } from "@/components/prime-dashboard";
import { parsePrime } from "@/lib/prime-reports";
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
  return <PrimeDashboard prime={prime} search={await searchParams} />;
}
