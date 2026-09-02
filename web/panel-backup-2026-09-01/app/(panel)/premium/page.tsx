"use client";

import { Suspense } from "react";
import { EyedPlusPremiumPage } from "@/components/features/premium/EyedPlusPremiumPage";

function PremiumFallback() {
  return (
    <div className="space-y-4">
      <div className="h-48 animate-pulse rounded-3xl border border-white/8 bg-white/5" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/5" />
        <div className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/5" />
      </div>
    </div>
  );
}

export default function PremiumPage() {
  return (
    <Suspense fallback={<PremiumFallback />}>
      <EyedPlusPremiumPage />
    </Suspense>
  );
}
