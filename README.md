# GURUBIT — SMS/OTP Platform

Mobile-first temporary phone number platform for receiving SMS and OTP messages.
Backend: Node 18 + Express + WebSocket + **MongoDB**, JWT-based custom authentication.

## 🚀 Features

- **MongoDB** — single source-of-truth database (users, posts, SMS, withdrawals, support, catalog, providers, social, etc.)
- **Custom JWT auth** — bcrypt-hashed passwords; HTTP-only session cookies
- **Real-time SMS feed** via WebSocket + provider polling (3 s)
- **Mobile-first design** with Tailwind CSS
- **Agent system** — user referrals, agent approval workflow, agent dashboards
- **Admin panel** with role-based permissions, broadcast, support chat, catalog/country management, withdrawal approvals, backup scheduler with Telegram delivery
- **Live social feed** with posts, groups, comments, likes, AI moderation
- **No Firebase, no Firestore** — fully self-contained MongoDB

## 🛠️ Tech Stack

| Layer    | Tech                                            |
|----------|-------------------------------------------------|
| Backend  | Node.js 18+, Express 4                          |
| DB       | MongoDB (Mongoose 8, with auto-synced indexes)  |
| Cache    | In-process TTL caches (post cache, group cache) |
| Auth     | bcryptjs + jsonwebtoken (HTTP-only cookie)      |
| Realtime | ws 8 (WebSocket)                                |
| Frontend | Vanilla ES modules + Tailwind CSS               |
| Email    | nodemailer (SMTP)                               |

## 📋 Prerequisites

- Node.js 18+ (tested with Node 24)
- A MongoDB instance — local, Docker, MongoDB Atlas, or Railway Key-Value
- Git

## 🔧 Installation

```bash
cd GURUBIT
npm install
cp .env.example .env
```

Then edit `.env` and set:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/gurubit       # or mongodb+srv://… for Atlas
MONGODB_DB=gurubit
ADMIN_PASSWORD=<your-strong-admin-password>
SESSION_SECRET=<long-random-string-min-32-chars>
```

### Optional (SMTP for "Activate Now" / password reset emails)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=…
SMTP_PASS=…
SMTP_FROM="GURUBIT" <noreply@your-domain.com>
```

You can configure SMTP later from the Admin → Database panel.

## 🚀 Run

| Command           | Purpose                                |
|-------------------|----------------------------------------|
| `npm run dev`     | Start with nodemon (auto-reload)       |
| `npm start`       | Start production server                |
| `npm run seed`    | Seed "main" social group + default settings |
| `npm run build:css` | Build Tailwind CSS once              |
| `npm run watch:css` | Build Tailwind CSS on filesystem    |

Server listens on `http://localhost:3000` (override with `PORT` env var).

## 🗄️ MongoDB collections

All 28 collections live in a single database. They auto-create with optimised indexes on first startup:

| Collection            | Purpose                                            |
|-----------------------|----------------------------------------------------|
| `users`               | End-user accounts (with bcrypt password hash)      |
| `sessions`            | JWT session records                                |
| `countries`           | Catalog countries                                  |
| `servers`             | Catalog servers (numbers array per server)         |
| `platforms`           | Catalog platforms                                  |
| `phoneNumbers`        | Allocated phone numbers (status, OTP, expiry)      |
| `smsMessages`         | Received SMS                                       |
| `withdrawalRequests`  | Withdrawal queue                                   |
| `smsProviders`        | SMS provider config                                |
| `userApiKeys`         | Per-user API keys for bulk agents                  |
| `appConfig`           | Misc app config (SMTP config etc.)                 |
| `agentApprovals`      | Agent → member approval queue                      |
| `broadcasts`          | Admin broadcast messages                           |
| `adminStaff`          | Admin staff accounts (bcrypt hashed)               |
| `adminSessions`       | Admin session tokens (TTL: 7 d)                    |
| `costRates`           | Per country/server reward configuration            |
| `supportSessions`     | Live-support chat sessions                         |
| `supportMessages`     | Live-support chat messages                         |
| `guests`              | Guest users (TTL: 24 h)                            |
| `guruPosts`           | Social posts                                       |
| `guruGroups`          | Social groups                                      |
| `guruGroupMessages`   | Group messages                                     |
| `guruFollows`         | User follows                                       |
| `guruReports`         | Post/user reports                                  |
| `guruSettings`        | AI moderation settings + flag/promo + ads          |
| `guruLikes` / `guruViews` / `guruComments` | Social interaction            |
| `groupMembers` / `groupBans` | Group membership                            |
| `announcements`       | Site-wide announcements                            |

Indexes that auto-sync on startup:
- Unique on `users.email`, `adminStaff.username`, `costRates(countryId,serverId)`
- Compound uniqueness on (`postId`,`userId`) for likes/views/comments/follows/groupMembers/groupBans
- Sparsely-indexed `email`, `agentEmail`, `mobileNumber`, `countryId`, `userId` etc.
- TTL indexes (auto-delete) on `sessions.expiresAt`, `guests.createdAt` (24 h), `adminSessions.expiresAt`

> All calls go through one facade in `config/db.js`. Routes/services never see Mongoose — they see the same Firebase-shaped API used previously (`collection(name).doc(id).get()`, `.where().get()`, `.add()`, `.batch()`, etc.), so the migration was a drop-in replacement.

## 🔌 API endpoints

### Auth
- `POST /api/auth/signup` — create user (must reference existing agent email)
- `POST /api/auth/login` — email + password → JWT in `sessionToken` cookie
- `POST /api/auth/logout` — clear session
- `GET  /api/auth/session` — current session info
- `GET  /api/auth/settings` — public settings (e.g. `allowGuestLogin`)
- `POST /api/auth/guest` — start a 24 h guest session
- `POST /api/auth/send-verification` — email "Activate Now" link
- `GET  /api/auth/verify-email?token=…` — handle verification link
- `POST /api/auth/send-password-reset` — email password-reset link
- `POST /api/auth/reset-password` — submit new password with token

### User
- `POST /api/user/profile/complete`
- `GET  /api/user/profile`
- `PUT  /api/user/profile`
- `GET  /api/user/dashboard`
- `POST /api/user/withdrawal`
- `GET  /api/user/withdrawal-history`
- `PUT  /api/user/profile/photo`
- `GET  /api/user/api-keys`

### SMS / Numbers
- `GET  /api/countries` — list countries + servers + counts
- `POST /api/numbers/generate` — allocate a number
- `GET  /api/numbers/:id` — get a number
- `GET  /api/numbers/:id/messages` — received messages
- `GET  /api/user/numbers` — your numbers
- `GET  /api/open/countries|servers|platforms|generate|sms` — public no-auth mirrors

### Admin (cookie: `admin_session`)
- `POST   /api/admin/login`
- `GET    /api/admin/check-auth`
- `POST   /api/admin/logout`
- `GET    /api/admin/dashboard`
- `GET    /api/admin/users` / `PUT /api/admin/users/:id/ban` … `DELETE /api/admin/users/:id`
- `GET    /api/admin/agents` / `POST /api/admin/agents`
- `GET    /api/admin/withdrawals` / `PUT /api/admin/withdrawals/:id/approve`
- `GET    /api/admin/countries` / `POST  /api/admin/countries` / `DELETE /api/admin/countries/:id` …
- `GET    /api/admin/catalog/{countries,servers,platforms}`
- `GET    /api/admin/api-keys` … `/api/admin/providers`
- `GET    /api/admin/leaderboard` / `/api/admin/active-users`
- `GET    /api/admin/range-analytics` / `/api/admin/range-live`
- `GET    /api/admin/guru/posts`/`groups` …
- `GET    /api/admin/support/sessions` … `POST /api/admin/support/sessions/:id/reply`
- `GET    /api/admin/database` / `/api/admin/database/env-config` / `/api/admin/database/test-email`
- `POST   /api/admin/database/{export,import,wipe}` / `POST /api/admin/database/restore/:id`

## 🔌 WebSocket events

| Direction       | Type                       | Payload                              |
|-----------------|----------------------------|--------------------------------------|
| Client → Server | `subscribe_sms_feed`       | —                                    |
| Client → Server | `subscribe_user_updates`   | `{userId}`                           |
| Client → Server | `subscribe_admin_updates`  | —                                    |
| Client → Server | `subscribe_number`         | `{numberId}`                         |
| Client → Server | `support_visitor_join`     | `{sessionId}`                        |
| Client → Server | `support_admin_join`       | —                                    |
| Client → Server | `support_send`             | `{sessionId, text, imageUrl}`        |
| Server → Client | `connection_established`   | —                                    |
| Server → Client | `subscription_confirmed`   | `{feed}`                             |
| Server → Client | `sms_received` / `new_sms` | full SMS                             |
| Server → Client | `otp_success`              | `{numberId, otp, …}`                 |
| Server → Client | `sms_feed_update`          | `{matched, phoneNumber, otp}`        |
| Server → Client | `number_expired`           | `{numberId, status:"failed"}`        |
| Server → Client | `admin_broadcast`          | `{title, message, …}`                |
| Server → Client | `support_*`                | live-support fan-out                 |
| Server → Client | `server_shutdown`          | —                                    |

## 🚚 Deploy

- **Railway** — `npm start`, set env vars (see `RAILWAY_DEPLOY.md`).
- **Render / Fly.io / VPS** — Node 18+ runtime, point `MONGODB_URI` to your Atlas cluster.

## 🛡️ Security

- bcrypt password hashing
- HTTP-only cookies with same-site
- JWT (HS256, SESSION_SECRET rotating)
- Mongoose schema validation + indexed uniqueness checks
- In-memory cache layers (post cache 5 s, group cache 5 s) instead of quota-dependent DAO calls

## 📝 License

ISC
