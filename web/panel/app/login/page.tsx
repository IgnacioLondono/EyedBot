"use client";

import { motion } from "framer-motion";
import { Eye } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07060d] px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full bg-violet-600/20 blur-3xl" />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center backdrop-blur-md"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-600/30 text-violet-200">
          <Eye className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-white">EyedBot Panel</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Inicia sesión con Discord para administrar tus servidores.
        </p>
        <a
          href="/auth/discord"
          className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4752c4]"
        >
          Continuar con Discord
        </a>
      </motion.div>
    </div>
  );
}
