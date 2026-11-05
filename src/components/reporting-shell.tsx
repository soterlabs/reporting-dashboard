"use client";
import { useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function ReportingShell({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <div className={`app-shell ${expanded ? "sidebar-expanded" : "sidebar-compact"}`}>
    {children}
    <button className="sidebar-toggle" type="button" aria-controls="reporting-sidebar" aria-expanded={expanded}
      aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"} title={expanded ? "Collapse sidebar" : "Expand sidebar"}
      onClick={() => setExpanded(v => !v)}>
      {expanded ? <PanelLeftClose size={17}/> : <PanelLeftOpen size={17}/>}
    </button>
  </div>;
}
