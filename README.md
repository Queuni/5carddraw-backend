# 5 Card Draw — Backend

Backend server for the **5 Card Draw Poker** game. REST API, Firebase auth, Redis-backed game rooms, and real-time multiplayer via Socket.IO.

[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)

---

## Features

- **REST API** — Auth, profile, rooms, leaderboard
- **Firebase Authentication** — Email/password, anonymous, token verification
- **Real-time multiplayer** — Socket.IO for game rooms and live play
- **Redis** — Session/game state and room management
- **Security** — Helmet, CORS, JWT, env-based config

---

## Tech Stack

| Layer        | Technology              |
| ------------ | ----------------------- |
| Runtime      | Node.js 20+             |
| Language     | TypeScript 5.3          |
| Framework    | Express 4.x             |
| Auth         | Firebase Admin SDK, JWT |
| Realtime     | Socket.IO 4.x           |
| Cache/State  | Redis (ioredis)         |
| Validation   | express-validator       |

---

## Prerequisites

- **Node.js** 20 or later  
- **Redis** (local or remote)  
- **Firebase** project (Authentication + optional Firestore)

---

## Quick Start

### 1. Clone and install

```bash
git clone <repository-url>
cd 5carddraw-backend
npm install
```

### 2. Environment variables

Copy the example env and set your values:

```bash
cp .env.example .env
```

Configure at least:

| Variable | Description | Example |
| -------- | ----------- | ------- |
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | `development` or `production` | `development` |
| `JWT_SECRET` | Secret for session/JWT signing | strong random string |
| `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT` | Redis connection | `redis://127.0.0.1:6379` |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Path to Firebase service account JSON | `./firebase-service-account.json` |
| or `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL` | Firebase credentials via env | — |
| `FIREBASE_WEB_API_KEY` | Firebase Web API key (for token verification) | from Firebase Console |
| `FRONTEND_URL` | Allowed CORS origin (optional) | `http://localhost:8080` |
| `APP_VERSION` | Optional app version string | `1.0.2` |

Firebase can be configured either by:

- **File:** place `firebase-service-account.json` in project root and set `FIREBASE_SERVICE_ACCOUNT_PATH` if needed, or  
- **Env:** set `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`.

### 3. Run

**Development (watch mode):**

```bash
npm run dev
```

**Production:**

```bash
npm run build
npm start
```

Server listens on `PORT` (default `3000`). WebSocket server is attached to the same HTTP server.

---

## API Overview

Base path: **`/api`**

### Health

- `GET /api/health` — Health check and version info (no auth).

### Auth — `/api/auth`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/signup` | — | Register with email/password |
| POST | `/signin` | — | Sign in, returns tokens |
| POST | `/verify-token` | — | Verify Firebase ID token |
| POST | `/create-anonymous` | — | Create anonymous user (e.g. WebGL) |
| POST | `/forgot-password` | — | Request password reset |
| POST | `/anonymous` | Bearer | Link anonymous to permanent account |
| POST | `/reset-password` | Bearer | Reset password (authenticated) |

Protected routes use `Authorization: Bearer <token>` (Firebase ID token or app JWT).

### Profile — `/api/profile`

All routes require authentication.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/` | Get current user profile |
| PUT | `/` | Update profile |
| DELETE | `/` | Delete account |

### Multiplayer — `/api/multiplayer`

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/rooms` | — | List available rooms |
| GET | `/rooms/:roomId` | — | Get room details |
| POST | `/rooms` | Bearer | Create room |
| DELETE | `/rooms/:roomId` | Bearer | Delete room (host only) |
| GET | `/leaderboard` | — | Multiplayer leaderboard |

### WebSocket

Socket.IO is mounted on the same server. Use for real-time game events (joins, actions, updates). Connect to the server origin (e.g. `http://localhost:3000`). Auth and event names are defined in `src/services/socketService.ts`.

---

## Project Structure

```
5carddraw-backend/
├── src/
│   ├── config/          # Firebase, Redis
│   ├── controllers/     # Auth, profile, multiplayer
│   ├── middleware/      # Auth, error handling
│   ├── routes/          # Express routers
│   ├── services/        # Business logic, Socket.IO, game/room services
│   ├── types/           # Shared TypeScript types
│   ├── utils/           # Helpers, validation, errors, version
│   └── server.ts        # Entry point
├── dist/                # Compiled output (after build)
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

---

## Scripts

| Command | Description |
| ------- | ----------- |
| `npm run dev` | Start with ts-node-dev (watch, no build) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run `node dist/server.js` |
| `npm run lint` | Run ESLint on `src/**/*.ts` |

---

## CORS

- **Development:** localhost and 127.0.0.1 origins are allowed.  
- **Production:** allowed origins include `https://5carddraw.app`, `https://5carddraw.net`, `https://www.5carddraw.net`, and `FRONTEND_URL` if set.

Adjust `allowedOrigins` in `src/server.ts` for your deployments.

---

## License

ISC

---

## Version

Current package version: **1.0.2**
