import { cn } from "@/lib/utils";
import { EyedBotIcon } from "@/components/brand/EyedBotIcon";

type EyedBotMarkProps = {
  className?: string;
  title?: string;
};

/** Marca EyedBot sin fondo: icono adaptable al tema. */
export function EyedBotMark({ className, title = "EyedBot" }: EyedBotMarkProps) {
  return (
    <div
      role="img"
      aria-label={title}
      title={title}
      className={cn("shrink-0 text-[color:var(--color-accent)]", className)}
    >
      <EyedBotIcon className="h-full w-full" detailed />
    </div>
  );
}
