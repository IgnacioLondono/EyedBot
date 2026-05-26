# Panel web EyedBot (`public/`)

## Raíz (solo entradas)

| Archivo | URL |
|---------|-----|
| `index.html` | `/` |
| `login.html` | `/login.html` |

## Carpetas

```
public/
├── index.html
├── login.html
├── partials/          # Pantallas HTML + overlays
│   └── screens/
└── assets/
    ├── js/            # app.js, screen-loader, mobile-*, welcome-card-studio
    ├── css/           # styles, dashboard-pro, módulos pro/
    └── archive/       # backups monolito (no servir en prod)
```

## Editar

- **Lógica:** `assets/js/app.js`
- **Pantalla:** `partials/screens/<nombre>.html`
- **Estilos pro:** `assets/css/pro/*.css` (agregador: `assets/css/dashboard-pro.css`)

## Regenerar partials / CSS desde monolito

```bash
node web/scripts/split-panel-assets.mjs
```

Más detalle: `partials/README.md`
