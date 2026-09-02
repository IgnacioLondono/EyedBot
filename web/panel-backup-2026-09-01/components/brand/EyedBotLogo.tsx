import Link from "next/link";
import { cn } from "@/lib/utils";
import { EyedBotMark } from "@/components/brand/EyedBotMark";

type EyedBotLogoProps = {
  href?: string;
  label?: string;
  subtitle?: string;
  markClassName?: string;
  className?: string;
  showText?: boolean | "desktop";
};

export function EyedBotLogo({
  href,
  label = "EyedBot",
  subtitle,
  markClassName,
  className,
  showText = true,
}: EyedBotLogoProps) {
  const content = (
    <>
      <EyedBotMark className={cn("eyedbot-mark-glow h-10 w-10 rounded-2xl", markClassName)} />
      {showText ? (
        <span
          className={cn(
            "min-w-0",
            showText === "desktop" && "hidden sm:block"
          )}
        >
          <span className="block truncate font-semibold text-white">{label}</span>
          {subtitle ? <span className="block truncate text-xs text-zinc-500">{subtitle}</span> : null}
        </span>
      ) : null}
    </>
  );

  const classes = cn("flex min-w-0 items-center gap-2.5 text-white", className);

  if (href) {
    return (
      <Link href={href} className={classes}>
        {content}
      </Link>
    );
  }

  return <div className={classes}>{content}</div>;
}
