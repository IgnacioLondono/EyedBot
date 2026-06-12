"use client";

import { PanelProvider } from "@/components/providers/PanelProvider";
import { PanelShell } from "@/components/layout/PanelShell";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PanelProvider>
      <PanelShell>{children}</PanelShell>
    </PanelProvider>
  );
}
