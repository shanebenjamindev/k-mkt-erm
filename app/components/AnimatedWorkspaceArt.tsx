/** Small inline illustration: no downloads, timers, canvas or animation library. */
export function AnimatedWorkspaceArt() {
  return <svg className="workspace-motion-art" width="100" height="72" viewBox="0 0 100 72" fill="none" aria-hidden="true" focusable="false">
    <rect x="7" y="12" width="86" height="53" rx="5" fill="var(--accent-soft, #fff0ef)"/>
    <rect x="11" y="8" width="78" height="51" rx="4" fill="white" stroke="#dce2eb"/>
    <path d="M11 19h78" stroke="#dce2eb"/>
    <circle cx="18" cy="14" r="1.5" fill="var(--accent, #e53935)"/><circle cx="24" cy="14" r="1.5" fill="#dfaa45"/><circle cx="30" cy="14" r="1.5" fill="#36a570"/>
    <g className="workspace-motion-card"><rect x="17" y="25" width="18" height="26" rx="3" fill="#eaf1fd"/><path d="M21 31h10M21 36h7M21 41h9" stroke="#5688d5" strokeWidth="2" strokeLinecap="round"/></g>
    <g className="workspace-motion-card"><rect x="41" y="25" width="18" height="26" rx="3" fill="#fff2d9"/><path d="M45 31h10M45 36h7M45 41h9" stroke="#c68b23" strokeWidth="2" strokeLinecap="round"/></g>
    <g className="workspace-motion-card"><rect x="65" y="25" width="18" height="26" rx="3" fill="#e6f6ed"/><path d="m69 38 3 3 7-8" stroke="#299b63" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></g>
    <g className="workspace-motion-spark" stroke="var(--accent, #e53935)" strokeWidth="1.6" strokeLinecap="round"><path d="M94 5v6M91 8h6M5 49v4M3 51h4"/></g>
  </svg>;
}
