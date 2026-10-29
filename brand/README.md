# Brand assets

| File | Purpose |
| :--- | :--- |
| `logo-source.png` | Original raster logo (1254 px, opaque black background). Source of truth for the vector trace. |
| `app-icon.svg` / `app-icon.png` | 1024 px macOS app icon (Apple grid: 824 px squircle on a 1024 px canvas). |
| `logo-paths.json` | Traced vector paths (`snake`, `term`, `facet`) used to build the SVG marks in `public/`. |

Regenerate the platform icon set after changing `app-icon.png`:

```bash
npx tauri icon brand/app-icon.png
rm -rf src-tauri/icons/android   # desktop-only app
```

Marks in `public/` (`soliton-mark*.svg`, `favicon.svg`) come in dark-UI and light-UI variants;
the `-compact` versions drop the facet shading for sizes below ~32 px.
