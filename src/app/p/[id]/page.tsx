import { Suspense } from "react";
import { Workspace } from "@/components/workspace/Workspace";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <Workspace id={id} />
    </Suspense>
  );
}
