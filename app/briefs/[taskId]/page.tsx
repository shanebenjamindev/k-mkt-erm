import { redirect } from "next/navigation";

export default async function LegacyBriefRoute({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  redirect(`/briefs?id=${encodeURIComponent(taskId)}`);
}
