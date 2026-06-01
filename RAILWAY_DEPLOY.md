# 🚂 Railway Deployment Guide — GURUBIT

## Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/gurubit.git
git push -u origin main
```

## Step 2: Create Railway Project

1. Go to [railway.com](https://railway.com)
2. Click **New Project**
3. Select **Deploy from GitHub repo**
4. Choose your `gurubit` repository
5. Railway will auto-detect Node.js and start deploying

## Step 3: Set Environment Variables

In Railway Dashboard → Your Service → **Variables** tab, add:

### Required
| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `ADMIN_PASSWORD` | Your strong admin password |
| `FIREBASE_SERVICE_ACCOUNT` | Paste full JSON from Firebase Console |

### Optional (for email features)
| Variable | Value |
|---|---|
| `FIREBASE_DATABASE_URL` | `https://your-project-rtdb.firebaseio.com` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `your@gmail.com` |
| `SMTP_PASS` | Your Gmail App Password |
| `SMTP_FROM` | `"GURUBIT" <your@gmail.com>` |

### Debug (keep false in production)
| Variable | Value |
|---|---|
| `MUTE_FIREBASE_WARNINGS` | `false` |
| `DEBUG_WS` | `false` |
| `DEBUG_POLLING` | `false` |
| `DEBUG_SMS` | `false` |

## Step 4: Get Firebase Service Account

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → **Project Settings** (gear icon)
3. Go to **Service Accounts** tab
4. Click **Generate new private key**
5. Copy the entire JSON content
6. Paste it as the value of `FIREBASE_SERVICE_ACCOUNT` in Railway

## Step 5: Configure Domain

1. In Railway → Your Service → **Settings** tab
2. Under **Networking** → **Public Networking**
3. Click **Generate Domain** for a free `*.railway.app` domain
4. Or add your custom domain

## Step 6: Verify Deployment

After deploy completes:
- Visit your Railway URL
- Go to `/admin` and login with your `ADMIN_PASSWORD`
- Check **System Online** indicator in top right

## Build & Start Commands

Railway uses these automatically (from `railway.json`):
- **Build:** `npm install && npm run build`
- **Start:** `node server.js`

## Troubleshooting

### App crashes on start
- Check Railway **Logs** tab for errors
- Verify `FIREBASE_SERVICE_ACCOUNT` is valid JSON
- Make sure `ADMIN_PASSWORD` is set

### Firebase not connecting
- Verify the service account JSON is complete and valid
- Check that Firestore is enabled in Firebase Console
- Ensure Firebase project billing is active (for production)

### WebSocket not working
- Railway supports WebSockets natively — no extra config needed
- Make sure your domain uses `wss://` (Railway provides HTTPS automatically)

### Port issues
- Railway automatically sets `PORT` env var — no manual config needed
- The app listens on `process.env.PORT || 3000`

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env
# Edit .env with your values

# Build CSS
npm run build

# Start server
npm start

# Or with auto-reload
npm run dev
```
