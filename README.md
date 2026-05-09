# EventHub Backend

B2B Sponsorship Marketplace API.

Frontend repository: <to be announce>

## Stack
- Node.js 24 + TypeScript 5
- Express 5
- PostgreSQL (Neon) + Prisma + pgvector
- Firebase Auth, Gemini AI, Google Cloud Storage
- Midtrans, Resend, Upstash Redis

## Setup

```bash
pnpm install
cp .env.example .env  # minta value ke backend dev
pnpm prisma migrate dev
pnpm dev
```

Server akan jalan di http://localhost:8080

## Scripts
- `pnpm dev` — development server (hot reload)
- `pnpm build` — compile TypeScript
- `pnpm typecheck` — cek type tanpa build
- `pnpm lint` — cek code style
- `pnpm prisma:studio` — GUI database

## Struktur Folder

```
src/
├── config/      # env, db, firebase, gemini, dll
├── modules/     # feature modules (auth, events, proposals, dll)
├── middlewares/ # error handler, validation, auth
├── common/      # errors, utils, validators
├── app.ts       # Express app setup
└── server.ts    # entry point
```