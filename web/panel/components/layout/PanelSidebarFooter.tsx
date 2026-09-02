"use client";

import Link from "next/link";
import { BookOpen, MessagesSquare, Terminal } from "lucide-react";
import { PanelSidebarUserCard } from "@/components/layout/PanelSidebarUserCard";
import { DocsSearchInput } from "@/components/features/docs/DocsSearchInput";

function QuickLink({
  href,
  icon: Icon,
  label,
  external,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  external?: boolean;
}) {
  const className = "sidebar-quick-link";
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

export function PanelSidebarFooter({
  user,
  displayName,
  docsSearch,
}: {
  user?: { id: string; avatar?: string | null; username: string; global_name?: string | null };
  displayName: string;
  docsSearch?: {
    value: string;
    onChange: (value: string) => void;
    inputId?: string;
  };
}) {
  return (
    <div className="sidebar-footer">
      <div className="sidebar-quick-links">
        <QuickLink
          href="https://discord.gg/eN6eQdGn87"
          icon={MessagesSquare}
          label="Soporte"
          external
        />
        <span className="sidebar-quick-dot" aria-hidden>
          ·
        </span>
        <QuickLink href="/commands" icon={Terminal} label="Comandos" />
        <span className="sidebar-quick-dot" aria-hidden>
          ·
        </span>
        <QuickLink href="/docs" icon={BookOpen} label="Docs" />
      </div>

      {docsSearch ? (
        <DocsSearchInput
          id={docsSearch.inputId ?? "panel-docs-search"}
          value={docsSearch.value}
          onChange={docsSearch.onChange}
          className="mt-3"
        />
      ) : null}

      <div className="mt-3">
        <PanelSidebarUserCard user={user} displayName={displayName} />
      </div>
    </div>
  );
}
