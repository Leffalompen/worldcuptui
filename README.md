# World Cup TUI (web)

A k9s‑style, keyboard‑driven web app for exploring FIFA World Cup data — groups,
standings, fixtures, results, countries, stadiums, rounds, top scorers and
per‑match detail — rendered as a fast terminal‑style table UI in the browser.

**Live site:** https://leffalompen.github.io/worldcuptui/

By default it shows the **2026** tournament. You can pick another edition or an
arbitrary data file via the URL (see [Data source](#data-source)).

---

## Data source

All tournament data comes from the open‑data project
**[openfootball / worldcup.json](https://github.com/openfootball/worldcup.json)**.

The app fetches the raw JSON directly from GitHub:

```
https://raw.githubusercontent.com/openfootball/worldcup.json/master/<year>/worldcup.json
```

This is implemented in `src/data/load.ts`. Because the data is loaded from an
absolute URL at runtime, nothing needs to be bundled or kept up to date in this
repo — you always get the latest published JSON from openfootball.

### Choosing what to load

Pass query parameters in the URL:

| Parameter | Example | Effect |
|-----------|---------|--------|
| `year`    | `?year=2022` | Loads `…/2022/worldcup.json` (default `2026`). |
| `url`     | `?url=https://…/worldcup.json` | Loads any compatible JSON file directly. |

Examples:

- `https://leffalompen.github.io/worldcuptui/?year=2018`
- `https://leffalompen.github.io/worldcuptui/?year=2022`

All credit for the underlying match data goes to the
[openfootball](https://github.com/openfootball) contributors.

---

## Refresh & caching

To stay fast and avoid hammering GitHub, fetched data is cached in the browser's
`localStorage` with a **1‑hour TTL** (time‑to‑live). The status line shows
whether the current view came from `cache` or `live`, along with the timestamp.

How it behaves:

- **First load / new source** — fetched live, then cached under a key derived
  from the chosen `year`/`url`.
- **Within the TTL (1 hour)** — served instantly from cache, no network request.
- **Stale cache (older than 1 hour)** — the app automatically re‑fetches in the
  background when the tab becomes visible, regains focus, is restored from the
  page cache, or on a periodic 5‑minute check while visible.
- **Manual refresh** — press **`r`** (or the refresh action) to force a live
  re‑fetch immediately, bypassing the cache regardless of age.

Your **favourite country** (press **`f`**) is also persisted in `localStorage`,
independent of the data cache.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j` / `↓` | Move cursor down |
| `k` / `↑` | Move cursor up |
| `Enter` | Open the selected row |
| `Esc` / `Backspace` | Go back |
| `g` | Home (main menu) |
| `G` | Open related view (e.g. a team's group) |
| `f` | Set / clear favourite country |
| `r` | Force refresh (live re‑fetch) |

Rows are also clickable, and breadcrumbs let you jump back up the stack.

---

## Development

Requires Node 20+.

```bash
npm ci          # install dependencies
npm run dev     # start the Vite dev server
npm run build   # type-check + production build to dist/
npm run preview # preview the production build locally
```

## Deployment

The site is built and published to GitHub Pages automatically by the workflow in
`.github/workflows/deploy.yml` on every push to `master`. Vite's `base` is set to
`/worldcuptui/` in `vite.config.ts` so assets resolve correctly under the Pages
subpath.
