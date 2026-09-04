# Deploying a live demo

The cheapest path to a URL you can put in a README: **Vercel for the frontend,
Render for the backend, Supabase for Postgres, Upstash for Redis.** All four have
free tiers that are adequate for a demo.

This is not the production path. `infra/terraform` provisions GKE and is left
intact for that — see [§7](#7-the-production-path-gke) — but GKE costs real money
per month whether anyone visits or not, which is the wrong trade for a demo.

For running locally rather than deploying, see the Quick Start in the
[README](../README.md). For operating a deployment, see [RUNBOOK.md](RUNBOOK.md).

---

## What this gets you, and what it doesn't

**Realistic expectation first**, because the free tiers have sharp edges that
matter for exactly this use case:

- **Render free web services sleep after 15 minutes of inactivity** and take
  ~30–60 seconds to wake. A visitor arriving cold waits. This is the single
  biggest thing that will make your demo look broken.
- **Free tiers have no persistent disk.** Anything not in Postgres or Redis is
  gone on restart.
- **No Kafka.** No free managed Kafka worth using. The services degrade rather
  than crash when Kafka is absent — the gateway logs and continues — but
  **document persistence goes through Kafka**, so on this deployment edits sync
  between users and are not durably saved. See [§5](#5-the-kafka-problem).
- **512MB RAM per free Render service.** Enough for one Node service, not for
  many.

If you want a demo that is always warm and actually persists, the smallest real
spend is Render's paid instances (~$7/service/month). Deploying the `all-in-one`
service instead of nine separate ones keeps that to one instance.

---

## 1. Database: Supabase

1. Create a project at <https://supabase.com/dashboard> (free tier).
2. In the SQL editor, paste and run [`infra/supabase/init.sql`](../infra/supabase/init.sql).
   It is written to be Supabase-compatible: single public schema, no `GRANT`
   statements.
3. From **Project Settings → Database**, copy the connection string.

**Use the connection pooler URL** (port 6543), not the direct connection (5432).
Free-tier Postgres allows very few direct connections and several services each
holding a `pg` pool will exhaust them.

> **Unverified:** the pooler in transaction mode does not support session-level
> features including prepared statements, and I have not confirmed the `pg` usage
> in doc-service is compatible. If you see errors mentioning prepared statements,
> that is this. Falling back to the direct URL with a small pool size is the
> workaround.

Note the `DATABASE_URL` for later.

## 2. Redis: Upstash

1. Create a database at <https://console.upstash.com> (free tier: 10k
   commands/day).
2. Copy the **`rediss://`** connection URL — TLS, not plain `redis://`.

Redis carries presence, the shard registry, cross-node fanout and a document
cache. With one backend instance, cross-node fanout is unused, so the free tier's
command budget is generous for a demo.

## 3. Backend: Render

The repository has an `all-in-one` service (`apps/all-in-one`) that runs the
combined backend in a single process. **Use it.** Deploying nine separate
services on free tiers means nine cold starts and nine chances for something to
be asleep when a visitor arrives.

1. At <https://dashboard.render.com>, **New → Web Service**, connect the repo.
2. Configure:

   | Setting | Value |
   |---|---|
   | Environment | Node |
   | Region | pick the one nearest your Supabase project |
   | Build command | `npm install --legacy-peer-deps && npm run build --workspace=@collabspace/all-in-one` |
   | Start command | `node apps/all-in-one/dist/index.js` |
   | Instance type | Free (or Starter to avoid sleeping) |

3. Environment variables:

   ```
   NODE_ENV=production
   DATABASE_URL=<Supabase pooler URL>
   REDIS_URL=<Upstash rediss:// URL>
   JWT_SECRET=<generate: openssl rand -base64 48>
   JWT_REFRESH_SECRET=<generate a different one>
   CORS_ORIGINS=https://<your-vercel-app>.vercel.app
   LOG_LEVEL=info
   GEMINI_API_KEY=<optional>
   ```

   **`JWT_SECRET` must be set.** Every service config defaults it to
   `dev-jwt-secret-change-in-production`, which is a publicly known value in this
   repository. If the variable is missing, the service starts anyway with that
   key and anyone can mint valid tokens for your demo.

4. Deploy. Render assigns `https://<name>.onrender.com`. Verify:

   ```bash
   curl https://<name>.onrender.com/health
   ```

Render terminates TLS, so WebSocket connections use `wss://` on the same host —
no separate port or configuration.

## 4. Frontend: Vercel

1. At <https://vercel.com/new>, import the repository.
2. Configure:

   | Setting | Value |
   |---|---|
   | Framework preset | Next.js |
   | Root directory | `apps/web` |
   | Build command | leave default |
   | Install command | `npm install --legacy-peer-deps` |

3. Environment variables:

   ```
   NEXT_PUBLIC_API_URL=https://<render-service>.onrender.com
   NEXT_PUBLIC_WS_URL=wss://<render-service>.onrender.com
   NEXT_PUBLIC_APP_URL=https://<your-app>.vercel.app
   ```

   These are **baked into the client bundle at build time**. Changing them
   requires a redeploy, not just a restart — a rebuild is the only way they take
   effect.

4. Deploy, then go back to Render and set `CORS_ORIGINS` to the Vercel URL now
   that you know it. Redeploy the backend.

## 5. Seed the demo data

An empty demo looks broken. Seed it:

```bash
DATABASE_URL="<your Supabase URL>" npm run db:seed:demo
```

This creates two users, three documents with real prose (including working Yjs
CRDT state, so the editor opens with content rather than blank), a kanban board
with twelve tasks, and a whiteboard with a system diagram. It is idempotent and
uses deterministic ids, so demo URLs stay stable across re-seeds.

Credentials are printed at the end. They are intentionally weak and public —
this is a demo, and anyone with the link should be able to try it.

### The Kafka problem

There is no Kafka in this deployment, and **document persistence runs through
Kafka**: ws-gateway produces to `document-updates`, doc-service consumes and
writes to Postgres.

What actually happens without it: `persistUpdateToKafka` catches the failure,
logs it, and continues. Edits still sync between connected users in real time,
because that path is peer-to-peer through the gateway and does not touch Kafka.
But they are **not written to Postgres**, so a document reverts to its seeded
state once everyone disconnects.

For a demo where visitors try the editor and leave, this is usually acceptable —
and arguably desirable, since the demo resets itself. **Do not mistake it for
working persistence.** Options if you need it:

- Run Kafka somewhere (Confluent Cloud has a free tier; it is fiddly).
- Modify doc-service to persist directly instead of via Kafka. This is a real
  code change, not configuration.
- Accept the reset behaviour and say so on the demo page.

## 6. Verify the deployment

```bash
# Backend is awake and healthy
curl https://<render-service>.onrender.com/health

# WebSocket upgrade is rejected without a token — a 401 here is CORRECT,
# and proves auth is enforced
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZQ==" \
     https://<render-service>.onrender.com/
```

Then, in a browser: open a seeded document in two windows and type in both. You
should see the other cursor and converging text. If text syncs but cursors do
not appear, see the protocol note in [LIMITATIONS.md](LIMITATIONS.md#11-the-web-client-and-ws-gateway-speak-different-protocols)
— that mismatch is a known, unfixed defect and this is exactly where it would
show up.

Finally, put the URL in the README:

```markdown
**Live demo:** https://<your-app>.vercel.app
```

## 7. The production path (GKE)

`infra/terraform` provisions a regional GKE cluster, Cloud SQL, Memorystore and
networking; `infra/k8s` has the manifests with staging and production overlays.
That is the right shape for production and the wrong shape for a demo — a GKE
cluster with Cloud SQL runs to a few hundred dollars a month before any traffic.

It is left intact and unmodified. See [DEPLOYMENT.md](DEPLOYMENT.md).

**Not verified.** I have not applied that Terraform. It is unproven
infrastructure code, and I would expect to spend a day on it before it came up
clean.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| First visit takes 60s | Render free tier cold start | Expected. Upgrade to Starter, or add an uptime pinger |
| WebSocket connects then immediately closes | `JWT_SECRET` differs between frontend-issued and backend-verified tokens | Ensure one value everywhere |
| `INVALID_TOKEN` on every connection | Same as above | Same |
| CORS errors in the browser console | `CORS_ORIGINS` does not include the Vercel URL | Set it and redeploy the backend |
| Frontend calls `localhost:4000` in production | `NEXT_PUBLIC_*` vars are build-time | Set them in Vercel and **rebuild** |
| `too many connections` from Postgres | Direct connection instead of the pooler | Use the port 6543 pooler URL |
| Errors mentioning prepared statements | Pooler transaction mode incompatibility | Use the direct URL with a small pool |
| Documents reset when everyone leaves | No Kafka, so no persistence | See [§5](#the-kafka-problem) |
| Build fails on peer dependencies | Workspace peer ranges | Ensure `--legacy-peer-deps` is in the install command |

---

## Limitations of this guide

- **I have not run this deployment end to end.** These steps are derived from
  the service configuration, the Render-related commits in this repository's
  history, and each provider's documentation. Expect to hit at least one thing
  that needs adjusting, most likely around the Supabase pooler or the
  `all-in-one` build command.
- **Costs are as of 2026-09-04** and free-tier terms change often.
- **No custom domain, CDN or monitoring setup is covered.** Prometheus, Grafana
  and Jaeger are all in the Docker Compose stack and are not deployed here, so a
  demo deployment has no observability at all beyond Render's log tail.
- **No backup strategy.** Supabase free tier backups are limited; for a demo
  that is fine, and you should not put anything in it you would miss.
- **Security posture is demo-grade.** Weak shared credentials, no rate limiting
  beyond what the services do in-process, no WAF, nothing audited. See
  [LIMITATIONS.md §4](LIMITATIONS.md#4-security).
