import { Suspense } from "react";
import { Compare } from "@/components/Compare";

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <Compare projectId={id} />
    </Suspense>
  );
}
