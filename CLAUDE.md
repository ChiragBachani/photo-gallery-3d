# 3D Photo Gallery Walkthrough — Project Context

## What this is
A standalone 3D walkable museum of Chirag Bachani's photography (chiragbachaniphotography.com), built Jul 8 2026 to be fun to share and enticing to potential clients. Three.js + Vite, plain JS, no backend. Status: **built and verified locally, not yet deployed**. Next step when asked: deploy as a static site (possibly Cloudflare Pages alongside the portfolio site, e.g. gallery.chiragbachaniphotography.com).

The user has no coding background — explain everything in plain English.

## Layout of the experience
Six themed rooms in a straight line along -Z, connected by doorways (user-chosen design: themed rooms, curated ~75 photos, free walk + guided tour):
1. **Recognized Works** (7 photos) — dark entrance hall, gold branding above doorway
2. **Astrophotography** (12) — near-black, star-field ceiling (THREE.Points)
3. **Concerts** (12) — magenta/amber point lights
4. **Travel** (24, 4 each) — bright warm hall, sections: New Zealand, Australia, Kenya, Tanzania, Israel, Jordan
5. **Portraits** (14) — white studio; sections Headshots (8) + Senior Pictures (6)
6. **Indian Culture in America** (6) — deep maroon, ends at clickable "Book a Session" CTA wall (email + @chiragbphoto Instagram)

Modes: **guided auto-tour** (flies past all 75 photos with captions, ends on CTA overlay), **free walk** (WASD/pointer-lock on desktop, joystick + drag-look on touch), **click-to-zoom** on any photo. `T` toggles tour, Esc exits.

## Photos
75 images in `public/photos/` are **resized copies** — originals live in
`../Photography Portfolio Site/src/photos/` (never modify those). Selection/captions come from that site's `manifest.json` + `src/data/site.js`. To refresh: `npm run photos` (runs `scripts/prepare-photos.mjs`, macOS `sips`, rewrites `public/gallery-data.json`).

## Code map (src/)
- `main.js` — renderer, boot, texture streaming (first 12 gate the loading screen), mode state machine (start/free/tour/focus), raycast clicks, `window.__gallery` debug handle (`teleport(z, yaw)`, `focus(i)`, `startTour`, `rooms`)
- `layout.js` — builds rooms/walls/colliders/signage/tour stops; `ROOMS` array holds themes & blurbs; canvas-texture text via `makeTextPlane` (auto-shrinks letterspaced text to fit)
- `controls.js` — first-person movement + circle-vs-box wall collision
- `tour.js` — `PoseTween` + `Tour` sequencer (doorway waypoints prevent wall clipping between rooms)
- `ui.js` — DOM overlay layer

## Gotchas
- `vite.config.js` sets build target **es2022** (main.js uses top-level await) — don't remove.
- Dev-server launch config `gallery-3d` (port 5199) lives in `Command Fort Version 2/.claude/launch.json` (that was the original session's primary dir).
- Photos render with `MeshBasicMaterial` + `toneMapped: false` on purpose (faithful colors, unaffected by room lighting). Don't "fix" by making them light-reactive.
- Headless/hidden-tab testing: requestAnimationFrame throttles, so tweens look frozen in screenshots — not a bug; verify on a visible tab.
- `npm run dev` / `npm run build` (dist ≈ 13MB).
