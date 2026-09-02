import { cn } from "@/lib/utils";
import { EyedBotIcon } from "@/components/brand/EyedBotIcon";

type EyedBotMarkProps = {
  className?: string;
  title?: string;
};

/** Icono de app — robot blanco con detalle sobre fondo morado en degradado. */
export function EyedBotMark({ className, title = "EyedBot" }: EyedBotMarkProps) {
  return (
    <div
      role="img"
      aria-label={title}
      title={title}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[25%] bg-gradient-to-b from-[#b794f6] to-[#6d28d9]",
        className
      )}
    >
      <EyedBotIcon className="h-full w-full text-white" detailed />
    </div>
  );
}
