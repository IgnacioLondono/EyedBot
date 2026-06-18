"use client";

import { Suspense } from "react";
import { BotHomePage } from "@/components/features/login/BotHomePage";

function HomeFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07060d] text-zinc-400">
      Cargando…
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <BotHomePage />
    </Suspense>
  );
}
