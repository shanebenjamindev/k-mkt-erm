import { briefToHtml } from "../../lib/brief-html";

export function BriefContent({ html, className = "" }: { html: string; className?: string }) {
  const safe = briefToHtml(html);
  return <div className={`brief-rich-content ${className}`.trim()} dangerouslySetInnerHTML={{ __html: safe }} />;
}
