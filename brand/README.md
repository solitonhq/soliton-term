# Brand assets

| File | Purpose |
| :--- | :--- |
| `logo-source.png` | Original raster logo (1254 px, opaque black background). Source of truth for the vector trace. |
| `app-icon.svg` / `app-icon.png` | 1024 px macOS app icon (Apple grid: 824 px squircle on a 1024 px canvas). |
| `wordmark-source.png` / `wordmark-paths.json` | Stacked SOLITON / TERM lockup (source raster and traced paths). Vector variants in `public/`: `soliton-wordmark*.svg` (stacked) and `soliton-wordmark-horizontal*.svg` (TopBar), each with a `-light` version for light UI. |
| `social-preview.png` | 1280×640 card shown when the repository is shared. GitHub has no API for it: upload it under *Settings → General → Social preview*. |
| `logo-paths.json` | Traced vector paths (`snake`, `term`, `facet`) used to build the SVG marks in `public/`. |

Regenerate the platform icon set after changing `app-icon.png`:

```bash
npx tauri icon brand/app-icon.png
rm -rf src-tauri/icons/android   # desktop-only app
```

Marks in `public/` (`soliton-mark*.svg`, `favicon.svg`) come in dark-UI and light-UI variants;
the `-compact` versions drop the facet shading for sizes below ~32 px.
