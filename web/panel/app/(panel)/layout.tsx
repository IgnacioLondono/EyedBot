"use client";

import { PanelProvider } from "@/components/providers/PanelProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ColorModeBootstrap } from "@/components/providers/ColorModeBootstrap";
import { ToastProvider } from "@/components/providers/ToastProvider";
import { PanelShell } from "@/components/layout/PanelShell";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PanelProvider>
      <ThemeProvider>
        <ColorModeBootstrap />
        <ToastProvider>
          <PanelShell>{children}</PanelShell>
        </ToastProvider>
      </ThemeProvider>
    </PanelProvider>
  );
}
