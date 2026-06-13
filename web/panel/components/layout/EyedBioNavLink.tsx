import { Link2 } from "lucide-react";
import { EYEDBIO_LABEL, EYEDBIO_URL } from "@/lib/eyedbio";
import { cn } from "@/lib/utils";

type EyedBioNavLinkProps = {
  className?: string;
  showLabel?: "always" | "sm" | "never";
  variant?: "nav" | "button";
};

export function EyedBioNavLink({
  className,
  showLabel = "sm",
  variant = "nav",
}: EyedBioNavLinkProps) {
  const labelClass =
    showLabel === "always" ? "inline" : showLabel === "sm" ? "hidden sm:inline" : "sr-only";

  return (
    <a
      href={EYEDBIO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-2xl text-sm font-medium transition",
        variant === "nav"
          ? "border border-cyan-400/35 bg-cyan-500/15 px-3 py-2 text-cyan-100 hover:border-cyan-300/50 hover:bg-cyan-500/25"
          : "border border-cyan-400/30 bg-gradient-to-r from-cyan-600/20 to-violet-600/20 px-4 py-2 text-cyan-50 hover:from-cyan-600/30 hover:to-violet-600/30",
        className
      )}
    >
      <Link2 className="h-4 w-4 shrink-0" />
      <span className={labelClass}>{EYEDBIO_LABEL}</span>
    </a>
  );
}
