import { Suspense } from "react";
import BriefsWorkspace from "./BriefsWorkspace";

export default function BriefsPage() {
  return <Suspense fallback={<main className="briefs-loading" role="status">Đang mở brief…</main>}><BriefsWorkspace /></Suspense>;
}
