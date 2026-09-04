# docs/images

Screenshots and recordings referenced from the root README.

**None of these files exist yet.** They need to be captured from a running
instance, which I cannot do — so the README links to them and they will render
as broken images until you record them. That is deliberate: a placeholder image
saying "screenshot coming soon" is worse than an obviously missing one, because
it can survive to production unnoticed.

## What to capture

| File | What it should show | How |
|---|---|---|
| `multi-cursor.gif` | Two browser windows side by side, both editing one document, each showing the other's coloured caret and name label moving in real time. 5–10 seconds is plenty. | LICEcap, ScreenToGif (Windows), or Kap (macOS) |
| `whiteboard.gif` | Drawing a few shapes on the infinite canvas with a second user's changes appearing live. Include a pan/zoom so the infinite canvas is legible. | same |
| `kanban.png` | The project board with a few columns and realistic task cards — run `scripts/seed-demo.ts` first so it is not empty. | any screenshot tool |
| `grafana-dashboard.png` | The provisioned CollabSpace dashboard at `http://localhost:3001` with real data in it. See below. | any screenshot tool |

## Capturing the Grafana screenshot

The dashboard has to have data in it, or the screenshot shows a grid of
"No data" panels, which is worse than no screenshot.

```bash
# 1. Bring up the stack including Prometheus and Grafana
docker compose -f infra/docker/docker-compose.yml up -d

# 2. Generate real traffic. Either run the integration suite against the
#    gateway repeatedly, or run a short load test if you have k6:
WS_URL=ws://localhost:4001 REQUIRE_INFRA=1 npm run test:integration
TARGET_VUS=200 DURATION_HOLD=2m npm run bench:ws

# 3. Wait ~2 minutes so Prometheus has several scrape intervals of data.
#    With a 15s scrape interval, rate()[5m] needs a few minutes to look sane.

# 4. Open http://localhost:3001 (admin/admin by default), find the
#    "CollabSpace" dashboard, set the time range to "Last 15 minutes",
#    and screenshot it.
```

## Guidelines

- **Record at a sensible size.** GIFs above ~3MB make the README slow to load on
  a phone. 800–1000px wide is usually enough.
- **Use the seeded demo data**, not an empty workspace or a real one. Real
  workspaces leak content; empty ones look unfinished. `scripts/seed-demo.ts`
  exists for this.
- **Do not crop out the browser chrome entirely** on the multi-cursor GIF — two
  distinct windows is the point being demonstrated, and a cropped view of one
  editor does not show collaboration at all.
- **Check for anything sensitive** before committing: tokens in a URL bar, real
  email addresses, workspace names.
