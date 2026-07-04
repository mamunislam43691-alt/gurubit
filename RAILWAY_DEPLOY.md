# Deploying GURUBIT to Railway

> **Note:** as of v2.0.0 GURUBIT runs on a single **MongoDB** database — no Firebase required.

## One-click deploy steps

1. Push the repo to GitHub.
2. On https://railway.app → **New Project** → **Deploy from GitHub**.
3. Railway auto-detects `Procfile`: `web: node server.js`.

## MongoDB

Provision either:
- **Railway Key-Value store** → set `MONGODB_URI` to the connection URL Railway gives you.
- **MongoDB Atlas** (free tier) → create a cluster, copy the `mongodb+srv://user:pass@cluster.mongodb.net/gurubit` connection string.

### Required environment variables

| Variable           | Example                                          |
|--------------------|--------------------------------------------------|
| `MONGODB_URI`      | `mongodb+srv://user:pass@cluster.mongodb.net/gurubit` |
| `MONGODB_DB`       | `gurubit`                                        |
| `NODE_ENV`         | `production`                                     |
| `PORT`             | `(Railway sets this automatically — don't override)` |
| `ADMIN_PASSWORD`   | `<strong-password>`                              |
| `SESSION_SECRET`   | random ≥ 32 chars                                |
| `SESSION_EXPIRY_HOURS` | `24`                                        |
| `APP_URL`          | `https://your-app.up.railway.app`                |

Optional (email "Activate Now" / password reset):

| Variable           | Example                                          |
|--------------------|--------------------------------------------------|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` |

The Admin → Database panel lets you update SMTP at runtime without redeploying.

## First-time setup

1. Server starts and **auto-creates** collections + indexes in MongoDB.
2. Log into `/admin` with the `ADMIN_PASSWORD`.
3. (Optional) Drop a `scripts/seed-data/catalog.json` on disk *before* first deploy and run `npm run seed`
   locally — or add countries via the Admin → Services panel.
4. (Optional) Create an agent via Admin → Agents. Share the agent email with your users so they can sign up.

## Local development

```bash
# 1. Start MongoDB locally
docker run -d -p 27017:27017 --name mongo mongo:7

# 2. Run app
npm install
npm run dev
```

That's it. No Firebase required.
