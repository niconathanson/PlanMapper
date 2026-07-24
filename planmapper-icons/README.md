# PlanMapper icon set

Polygon-nodes mark: a closed plan shape with amber vertex handles on a deep-blue tile.

## Colours

| Role | Hex |
|---|---|
| Tile | `#185FA5` |
| Outline / fill | `#FFFFFF` (fill at 18–22% opacity) |
| Vertex handles | `#EF9F27` |

## Files

**svg/**
- `planmapper-icon.svg` — master, 1024×1024 viewBox. Edit this one.
- `planmapper-icon-24.svg` — hand-tuned for 24px. Heavier stroke, pixel-snapped vertices.
- `planmapper-icon-16.svg` — hand-tuned for 16px. Glyph enlarged, dots thickened, fill lifted.
- `planmapper-icon-mono.svg` — single-colour silhouette using `currentColor`, transparent background.

**png/** — 1024, 512, 256, 128, 64, 48, 32, 24, 16, all RGBA.
Sizes 32 and up come from the master; 24 and 16 come from the tuned sources.
Also `planmapper-mono-{dark,light}-{32,24,16}.png` for menu bars and notification badges.

**planmapper.ico** — bundles 256, 128, 64, 48, 32, 24, 16. Windows picks per context.

**planmapper.icns** — macOS, including @2x variants (icp4/icp5/ic07–ic14).

**preview.png** — QA contact sheet: actual size on light, actual size on dark, and a 6× zoom of 32/24/16.

## Rebuilding

`python3 build.py` — requires `cairosvg` and `pillow`. Edit the SVGs, re-run, everything downstream regenerates.

## Notes

- Glyph sits inside roughly the middle 80% of the canvas, so platform cropping and shadowing won't clip the vertex dots.
- The tile corner radius is 21.9% of the width, close to the macOS squircle proportion. If you want a true squircle for a Mac-first build, substitute the superellipse path in the master.
- The monochrome variant drops the translucent fill entirely — at a single colour the fill would close up the shape.
