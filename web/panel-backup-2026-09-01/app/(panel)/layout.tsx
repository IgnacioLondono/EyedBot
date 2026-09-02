"use client";

import { PanelProvider } from "@/components/providers/PanelProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { PanelShell } from "@/components/layout/PanelShell";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PanelProvider>
      <ThemeProvider>
        <ToastProvider>
          <PanelShell>{children}</PanelShell>
        </ToastProvider>
      </ThemeProvider>
    </PanelProvider>
  );
}
