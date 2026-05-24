# EventHub Backend

B2B Sponsorship Marketplace API.

📖 **[Lihat API Documentation](./docs/API.md)** untuk dokumentasi lengkap endpoint, dan import [Postman Collection](./docs/EevntHub-backend.postman_collection.json) untuk testing.

Frontend repository: <link-repo-frontend-mu>

## Stack

- Node.js 24 + TypeScript 5
- Express 5
- PostgreSQL (Neon) + Prisma 7 + pgvector
- Firebase Auth, Gemini AI 2.5, Firebase Storage
- Midtrans, Resend, Upstash Redis

## Setup

```bash
pnpm install
cp .env.example .env  # minta value ke backend dev
pnpm prisma migrate dev
pnpm dev
```

Server akan jalan di http://localhost:8080

## Progress Modul

- [✅] Auth (Firebase + role-based)
- [✅] Events (CRUD + tier + proposal + catalog)
- [✅] AI (Proposal Builder + Smart Review via Gemini)
- [✅] Billing (Token management)
- [✅] Matchmaking (pgvector similarity)
- [✅] Sponsorship Offer (Company → Event)
- [✅] Payment (Midtrans top-up)
- [✅] File Storage (GCS upload)
- [✅] Messaging (async chat)
