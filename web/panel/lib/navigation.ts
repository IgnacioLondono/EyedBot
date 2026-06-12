import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Bolt,
  DoorOpen,
  FileBadge2,
  Gamepad2,
  Gift,
  Info,
  LayoutDashboard,
  LayoutGrid,
  Mic,
  Shield,
  Sparkles,
  Terminal,
  Ticket,
  User,
  Crown,
  Palette,
  Settings,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  premium?: boolean;
};

export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/about", label: "Acerca de", icon: Info },
  { href: "/commands", label: "Comandos", icon: Terminal },
  { href: "/premium", label: "EyedPlus+", icon: Sparkles, premium: true },
];

export const SETTINGS_NAV: NavItem[] = [
  { href: "/settings/account", label: "Cuenta", icon: User },
  { href: "/settings/owner", label: "Propietario", icon: Crown },
  { href: "/settings/theme", label: "Personalización", icon: Palette, premium: true },
];

export type ServerPane = {
  id: string;
  slug: string;
  label: string;
  icon: LucideIcon;
  premium?: boolean;
};

export const SERVER_PANES: ServerPane[] = [
  { id: "overview", slug: "overview", label: "Resumen", icon: LayoutGrid },
  { id: "welcome", slug: "welcome", label: "Bienvenida", icon: DoorOpen },
  { id: "verify", slug: "verify", label: "Verificación", icon: Shield },
  { id: "tickets", slug: "tickets", label: "Tickets", icon: Ticket, premium: true },
  { id: "levels", slug: "levels", label: "Niveles", icon: Bolt },
  { id: "voice", slug: "voice", label: "Voz temporal", icon: Mic },
  { id: "automation", slug: "automation", label: "Automatización", icon: Settings },
  { id: "gacha", slug: "gacha", label: "Gacha", icon: Gamepad2, premium: true },
  { id: "moderation", slug: "moderation", label: "Moderación", icon: Shield },
  { id: "security", slug: "security", label: "Seguridad", icon: Shield, premium: true },
  { id: "notifications", slug: "notifications", label: "Alertas", icon: Bell },
  { id: "free-games", slug: "free-games", label: "Juegos gratis", icon: Gift, premium: true },
  { id: "embed", slug: "embed", label: "Embeds", icon: FileBadge2 },
];

export function serverPaneHref(guildId: string, slug = "overview") {
  return `/server/${guildId}/${slug}`;
}
