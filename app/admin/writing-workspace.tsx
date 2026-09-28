"use client";

import { useId, useState, type ReactNode } from "react";

export default function WritingWorkspace({ library, children }: { library: ReactNode; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const libraryId = useId();
  const action = collapsed ? "Expand library" : "Collapse library";

  return <div className={`writer-workspace${collapsed ? " is-library-collapsed" : ""}`}>
    <aside className="writer-sidebar" aria-label="Library and settings">
      <div className="writer-sidebar-header">
        <span hidden={collapsed}>Library &amp; settings</span>
        <button type="button" className="writer-sidebar-toggle" aria-label={action} title={action}
          aria-expanded={!collapsed} aria-controls={libraryId} onClick={() => setCollapsed(value => !value)}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            <path d={collapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} />
          </svg>
        </button>
      </div>
      {/* Hide, rather than unmount: autosave and library state keep running. */}
      <div id={libraryId} hidden={collapsed}>{library}</div>
    </aside>
    {children}
  </div>;
}
