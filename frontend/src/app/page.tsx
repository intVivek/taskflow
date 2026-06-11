import { Suspense } from "react";
import { AppHeader } from "@/components/header";
import { TaskList } from "@/components/tasks/task-list";
import { SkeletonRows } from "@/components/tasks/list-states";

export default function Home() {
  return (
    <div className="min-h-screen bg-bg">
      <AppHeader />
      <main className="max-w-3xl mx-auto px-4 pb-16">
        <Suspense
          fallback={
            <div className="space-y-4 pt-6">
              <div className="h-7 w-24 bg-raised rounded-md animate-pulse" />
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <SkeletonRows n={8} />
              </div>
            </div>
          }
        >
          <TaskList />
        </Suspense>
      </main>
    </div>
  );
}
