"use client";

import { Suspense } from "react";
import { BotHomePage } from "@/components/features/login/BotHomePage";

function LoginFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07060d] text-zinc-400">
      Cargando…
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <BotHomePage />
    </Suspense>
  );
}
