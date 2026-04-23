import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getScanForUser, serializeScan } from "@/lib/scans/service";
import { ScanClient } from "./scan-client";

export const dynamic = "force-dynamic";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/api/auth/github/start");

  const { id } = await params;
  const scan = await getScanForUser(user.id, id);
  if (!scan) notFound();

  return <ScanClient initialScan={serializeScan(scan)} />;
}

