import type { LucideIcon } from "lucide-react";
import {
  Bell,
  Gamepad2,
  Gift,
  Palette,
  Shield,
  Sparkles,
  Ticket,
  Image,
  Zap,
} from "lucide-react";

export type EyedPlusFeature = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tier: "plus";
};

export const EYEDPLUS_FEATURES: EyedPlusFeature[] = [
  {
    id: "tickets",
    title: "Tickets avanzados",
    description: "Panel de gestión, historial, informes y chat con el usuario desde el panel.",
    icon: Ticket,
    tier: "plus",
  },
  {
    id: "gacha",
    title: "Gacha completo",
    description: "Catálogo, inventario, mercado y economía del servidor.",
    icon: Gamepad2,
    tier: "plus",
  },
  {
    id: "security",
    title: "Seguridad pro",
    description: "Anti-raid, anti-spam y filtros avanzados para proteger tu comunidad.",
    icon: Shield,
    tier: "plus",
  },
  {
    id: "free-games",
    title: "Juegos gratis",
    description: "Feed automático de ofertas Epic Games y Steam en tu canal.",
    icon: Gift,
    tier: "plus",
  },
  {
    id: "theme",
    title: "Personalización total",
    description: "Temas, presets, colores, blur y fondo propio en todo el panel.",
    icon: Palette,
    tier: "plus",
  },
  {
    id: "wallpaper",
    title: "Fondo inmersivo",
    description: "Imagen o video de fondo con velo y bloom configurables.",
    icon: Image,
    tier: "plus",
  },
  {
    id: "alerts",
    title: "Prioridad en módulos",
    description: "Acceso completo a alertas, automatización y herramientas premium.",
    icon: Bell,
    tier: "plus",
  },
  {
    id: "support",
    title: "EyedPlus+ badge",
    description: "Distintivo en el panel y soporte prioritario para tu servidor.",
    icon: Sparkles,
    tier: "plus",
  },
];

export const EYEDPLUS_FREE_FEATURES = [
  "Dashboard y resumen del servidor",
  "Bienvenida, verificación y niveles",
  "Embeds y comandos del bot",
  "Alertas básicas y moderación",
];

export const EYEDPLUS_FAQ = [
  {
    q: "¿Cómo pago con WebPay?",
    a: "Al activar EyedPlus+ serás redirigido a WebPay (Transbank). Puedes pagar con tarjeta de débito, crédito o prepago.",
  },
  {
    q: "¿Se renueva solo?",
    a: "Cada pago activa EyedPlus+ por 30 días. Para renovar, vuelve a esta página y paga nuevamente antes de que expire.",
  },
  {
    q: "¿Afecta a todo mi servidor?",
    a: "EyedPlus+ está ligado a tu cuenta de Discord. Tú desbloqueas los módulos premium en los servidores que administras.",
  },
  {
    q: "¿Puedo cancelar?",
    a: "Sí. Puedes marcar que no quieres renovar; el acceso sigue hasta la fecha de vencimiento.",
  },
];

export function formatPlanPrice(amount: number, currency = "CLP") {
  if (currency === "CLP") {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(amount);
  }
  return `${amount} ${currency}`;
}
