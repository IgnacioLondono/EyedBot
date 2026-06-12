# EyedBot Panel (Next.js 16)

Frontend nuevo del panel de administración.

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Framer Motion
- Lucide React

## Desarrollo

Con el bot/Express en el puerto 3000:

```bash
cd web/panel
npm run dev
```

Las peticiones `/api/*` se reescriben a `http://127.0.0.1:3000` (ver `next.config.ts`).

## Producción

Express monta el build de Next automáticamente (`web/next-panel.js`).

```bash
cd web/panel && npm run build
```

Variable `PANEL_NEXT_ENABLED=false` vuelve al frontend legacy en `web/public/`.

## Rutas

| Ruta | Descripción |
|------|-------------|
| `/dashboard` | Lista de servidores |
| `/about` | Acerca de / KPIs |
| `/commands` | Catálogo de comandos |
| `/premium` | EyedPlus+ / billing |
| `/settings/*` | Cuenta, owner, sistema, tema |
| `/server/[guildId]/[pane]` | Módulos del servidor |

API tipada en `lib/api/endpoints.ts`.
