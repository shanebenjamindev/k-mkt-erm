import { Suspense } from "react";
import TasksClient from "./task-clients";

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksClient />
    </Suspense>
  );
}