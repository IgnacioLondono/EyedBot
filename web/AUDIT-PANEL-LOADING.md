# Auditoría: panel atascado en "Cargando..."

## Síntoma
- Navbar: `Cargando...` (`layout-shell.html` → `#userName`)
- Dashboard: `Cargando servidores...` (`dashboard.html` → `#guildsList`)

Esos textos son **placeholders HTML** hasta que `bootEyedBotPanel()` complete `bootstrapPanel()` y `displayGuilds()`.

## Causas encontradas (corregidas en min12)

| Prioridad | Problema | Efecto |
|-----------|----------|--------|
| Crítico | Boot llamaba `showSection(serverSection)` antes de cargar guilds | Descargaba `server.html` enorme y bloqueaba la lista |
| Crítico | Sin endpoint único de arranque | Varias APIs lentas en serie |
| Alto | Sesión MySQL sin caché L1; timeout → sesión vacía | APIs 401 o cuelgue |
| Alto | `express.static` servía `/pages/*.html` sin login | HTML visible sin datos |
| Alto | Docker no ejecutaba `npm run build:assets` | `app.min.js` desactualizado |
| Medio | `web/Dockerfile` aislado incompleto | No incluye `src/` |

## Comprobaciones en producción

1. `GET /health` → `botConnected: true`, `dbOk: true`
2. `GET /api/panel/bootstrap` (con cookie) → JSON con `user` y `guilds`
3. Navegador: `app.min.js?v=20260528-min12` y `panel-boot.js`
4. Rebuild imagen desde **Dockerfile raíz** (no solo `web/Dockerfile`)

## Variables .env relevantes

- `REDIRECT_URI` / `SESSION_COOKIE_SECURE` (HTTPS)
- `DB_HOST`, `DB_PASSWORD`, …
- `SESSION_STORE_TIMEOUT_MS`, `DB_CONNECT_TIMEOUT_MS`
