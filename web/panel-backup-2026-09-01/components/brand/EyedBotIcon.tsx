import { cn } from "@/lib/utils";
import { EYEDBOT_EYE_PATH, EYEDBOT_MARK_VIEWBOX } from "@/lib/brand";

type IconProps = {
  className?: string;
  detailed?: boolean;
};

/** Robot EyedBot en trazo (currentColor). */
export function EyedBotIcon({ className, detailed = false }: IconProps) {
  return (
    <svg
      className={cn("shrink-0", className)}
      viewBox={EYEDBOT_MARK_VIEWBOX}
      fill="none"
      aria-hidden={detailed ? undefined : true}
    >
      <line x1="11" y1="8" x2="9.5" y2="3" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <line x1="21" y1="8" x2="22.5" y2="3" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
      <circle cx="9.5" cy="3" r="1.75" fill="currentColor" />
      <circle cx="22.5" cy="3" r="1.75" fill="currentColor" />
      <rect x="6" y="8" width="20" height="20" rx="5.5" stroke="currentColor" strokeWidth="2.25" />
      <rect x="3.3" y="16.3" width="3.2" height="3.4" rx="1.6" fill="currentColor" />
      <rect x="25.5" y="16.3" width="3.2" height="3.4" rx="1.6" fill="currentColor" />
      <path d={EYEDBOT_EYE_PATH} fill="currentColor" />
      {detailed ? <circle cx="16" cy="18" r="1.05" fill="#c4b5fd" /> : null}
    </svg>
  );
}
