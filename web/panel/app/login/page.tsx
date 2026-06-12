"use client";

import { Suspense } from "react";
import { LoginLanding } from "@/components/features/login/LoginLanding";

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
      <LoginLanding />
    </Suspense>
  );
}
