# EventHub Backend - API Documentation

Base URL: `http://localhost:8080/api/v1`

## Quick Start untuk Frontend Dev

1. Dapatkan Postman collection dari Backend
2. Dapatkan dan Import environment Postman dari Backend
3. Run request `🔐 Generate Firebase Token` untuk dapat ID token (auto-save)
4. Test endpoint lain bebas

## Authentication

Backend pakai **Firebase Auth**. Frontend handle login langsung ke Firebase, lalu kirim ID Token ke backend lewat header.

### Flow

```
Frontend                    Firebase                Backend
   │                           │                      │
   │── signInWithEmail ───────▶│                      │
   │◀── idToken ───────────────│                      │
   │                                                  │
   │── Authorization: Bearer <idToken> ──────────────▶│
   │                                verifyIdToken ─── │
   │                                                  │
   │◀── data ─────────────────────────────────────────│
```

### Header untuk Setiap Authenticated Request

```
Authorization: Bearer <firebase_id_token>
Content-Type: application/json
```

### Token Expiry

Firebase ID token expired setelah **1 jam**. Frontend harus refresh token via Firebase SDK (`getIdToken(true)`) atau pakai refresh token.

---

## Response Format

### Success
```json
{
  "success": true,
  "data": { ... }
}
```

### Error
```json
{
  "success": false,
  "message": "Error description",
  "errors": { ... }  // optional, untuk validation errors
}
```

### Common Status Codes

| Status | Meaning |
|--------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Validation error / bad request |
| 401 | Missing / invalid token |
| 402 | Insufficient tokens (untuk fitur AI) |
| 403 | Forbidden (role mismatch / not owner) |
| 404 | Resource not found |
| 409 | Conflict (e.g., duplicate, can't delete) |
| 500 | Server error |

---

## Endpoints Overview

### 🔐 Auth

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/register` | Firebase Token | Daftar user baru (EO atau Company) |
| POST | `/auth/login` | Required | Sync user dari Firebase ke DB |
| GET | `/auth/me` | Required | Get user info + profile |
| DELETE | `/auth/me` | Required | Soft delete akun |

### 🎪 Events (EO Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/events` | Create event (draft) |
| GET | `/events/my` | List event milik EO |
| GET | `/events/:id` | Get event by ID (owner only) |
| PATCH | `/events/:id` | Update event |
| DELETE | `/events/:id` | Delete event |
| POST | `/events/:id/publish` | Publish event ke katalog |
| POST | `/events/:id/close` | Tutup event |
| POST | `/events/:id/tiers` | Tambah sponsorship tier |
| PATCH | `/events/:id/tiers/:tierId` | Update tier |
| DELETE | `/events/:id/tiers/:tierId` | Delete tier |
| POST | `/events/:id/proposal` | Set/upload proposal |

### 🌐 Public Catalog (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/catalog/events` | List published events (filter + pagination) |
| GET | `/catalog/events/:slug` | Get event detail by slug |

**Query params untuk catalog:**
- `category` — TECHNOLOGY, BUSINESS, ARTS, dll
- `city` — string
- `isOnline` — boolean
- `minAttendees` / `maxAttendees` — number
- `search` — string (cari di title/description)
- `page` — default 1
- `limit` — default 12, max 50

### 🤖 AI (EO Only, Butuh Token)

| Method | Endpoint | Cost | Description |
|--------|----------|------|-------------|
| POST | `/ai/proposal-builder` | 5 token | Generate proposal lengkap dari data event |
| POST | `/ai/smart-review` | 3 token | Analyze proposal: score + issues + suggestions |

---

## User Roles & Workflow

### User Roles
- `EO` — Panitia/organizer event (mahasiswa, BEM, HIMA, UKM, komunitas)
- `COMPANY` — Brand/sponsor

### EO Workflow
```
1. Register sebagai EO (POST /auth/register, role: EO)
2. Create event (POST /events) — status: DRAFT
3. Tambah minimal 1 tier (POST /events/:id/tiers)
4. Set proposal — pilih salah satu:
   - Upload PDF: POST /events/:id/proposal (source: UPLOAD, fileUrl)
   - Generate AI: POST /ai/proposal-builder (otomatis set proposal)
5. (Opsional) Review proposal: POST /ai/smart-review
6. Publish event: POST /events/:id/publish — sekarang muncul di public catalog
7. Tunggu offer dari Company (modul Offer belum dibuat)
```

### Company Workflow
```
1. Register sebagai Company (POST /auth/register, role: COMPANY)
2. Browse public catalog (GET /catalog/events) — no auth needed
3. Buka detail event (GET /catalog/events/:slug)
4. (Akan datang) Make offer ke event
```

---

## Token System (Premium Features)

Saat signup, user dapat **10 token gratis**.

**Cost per fitur:**
- Proposal Builder: 5 token
- Smart Review: 3 token
- Unlock Contact: 2 token (Fitur menyusul)

**Top-up via Midtrans** (Fitur menyusul).

Kalau saldo token kurang, response: `402 Payment Required` dengan pesan `Insufficient tokens...`.

---

## Sample Request: Register sebagai EO

```http
POST /auth/register
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "role": "EO",
  "name": "Wira Bakti",
  "profile": {
    "organizationName": "BEM Fakultas Teknik UGM",
    "organizationType": "BEM",
    "campus": "Universitas Gadjah Mada",
    "phoneNumber": "081234567890",
    "city": "Yogyakarta",
    "description": "Badan Eksekutif Mahasiswa FT UGM"
  }
}
```

`organizationType` enum: `BEM | HIMA | UKM | COMMUNITY | OTHER`

## Sample Request: Register sebagai Company

```http
POST /auth/register
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "role": "COMPANY",
  "name": "Budi Santoso",
  "profile": {
    "companyName": "PT Teknologi Maju",
    "industry": "Technology",
    "description": "Perusahaan teknologi yang fokus di pengembangan software untuk UMKM",
    "website": "https://teknologimaju.com",
    "phoneNumber": "021-12345678",
    "city": "Jakarta",
    "targetAudience": "Mahasiswa dan profesional muda di bidang teknologi"
  }
}
```

---

## Sample Request: Create Event

```http
POST /events
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "title": "TechFest UGM 2026",
  "description": "Festival teknologi tahunan terbesar di UGM...",
  "category": "TECHNOLOGY",
  "theme": "AI & Future of Work",
  "startDate": "2026-08-15",
  "endDate": "2026-08-17",
  "city": "Yogyakarta",
  "venue": "Grha Sabha Pramana UGM",
  "isOnline": false,
  "expectedAttendees": 2000,
  "audienceAgeMin": 18,
  "audienceAgeMax": 25,
  "audienceInterests": ["technology", "startup", "AI", "programming"]
}
```

`category` enum: `TECHNOLOGY | BUSINESS | ARTS | SPORTS | EDUCATION | SOCIAL | ENTERTAINMENT | COMPETITION | CONFERENCE | WORKSHOP | OTHER`

---

## Sample Request: Generate Proposal (AI)

```http
POST /ai/proposal-builder
Authorization: Bearer <firebase_id_token>
Content-Type: application/json

{
  "eventId": "<cuid>",
  "tone": "PERSUASIVE",
  "targetSponsorIndustry": "Technology",
  "additionalContext": "Acara kolaborasi dengan komunitas developer Indonesia"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "proposal": { "id": "...", "source": "GENERATED", ... },
    "content": {
      "executiveSummary": "...",
      "eventBackground": "...",
      "objectives": ["...", "..."],
      "targetAudience": "...",
      "whyThisEvent": "...",
      "sponsorshipBenefits": ["...", "..."],
      "callToAction": "..."
    }
  }
}
```

`tone` enum: `FORMAL | CASUAL | PERSUASIVE`

---

## Belum Dibuat (Coming Soon)

- Sponsorship Offer (Company → Event)
- Messaging (async chat dalam offer)
- Matchmaking (FYP-style rekomendasi)
- Midtrans payment integration
- File upload ke Google Cloud Storage