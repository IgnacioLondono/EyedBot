# Partials del panel web

El `index.html` (raíz de `public/`) carga estas piezas con `assets/js/screen-loader.js`.

## Pantallas (`screens/`)

| Archivo | Sección |
|---------|---------|
| `dashboard.html` | `#dashboard` |
| `about.html` | `#controlCenterSection` |
| `premium.html` | `#premiumSection` |
| `settings.html` | `#profileSettingsSection` |
| `embed.html` | `#embedSection` |
| `stats.html` | `#statsSection` |
| `logs.html` | `#logsSection` |
| `nuke.html` | `#nukeSection` |
| `commands.html` | `#commandsSection` |
| `server.html` | `#serverSection` |

## Overlays

`overlays.html` — modales globales (servidor, toasts, tickets, diálogos).

## CSS y JS

Ver `../README.md` en la raíz de `public/`.

## Regenerar desde monolito

Backups en `assets/archive/`. Luego:

```bash
node web/scripts/split-panel-assets.mjs
```
