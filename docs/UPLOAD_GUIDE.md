# File Upload Guide (Firebase Storage)

```Backend EventHub tidak handle file upload langsung```. Frontend upload file ke Firebase Storage menggunakan Firebase SDK, lalu kirim **download URL** hasilnya ke backend.

## Flow Upload

```
Frontend                  Firebase Storage           Backend
   │                            │                       │
   │ 1. User pilih file         │                       │
   │ 2. Upload via Firebase SDK │                       │
   │ ───────────────────────────▶                       │
   │                            │                       │
   │ 3. Get download URL ◀──────│                       │
   │                            │                       │
   │ 4. POST URL ke backend     │                       │
   │ (e.g., POST /events with bannerUrl)                │
   │ ─────────────────────────────────────────────────▶ │
   │                            │                       │
   │                            │                       │ 5. Validate URL
   │                            │                       │    & save to DB
   │ ◀──────────────────────────────────────────────────│
```

## Path Structure di Firebase Storage

| File | Path | Max Size | Format |
|------|------|----------|--------|
| User avatar/logo | `/users/{firebaseUid}/avatar.{ext}` | 2 MB | jpg, jpeg, png, webp, gif |
| Event banner | `/events/{eventId}/banner.{ext}` | 5 MB | jpg, jpeg, png, webp, gif |
| Event proposal | `/events/{eventId}/proposal.pdf` | 10 MB | pdf only |

**Penting:** `{eventId}` adalah ID event yang dapat dari backend setelah create event. Jadi flow-nya:
1. Create event dulu via `POST /events` (tanpa banner/proposal)
2. Backend return event dengan `id`
3. Upload file ke `/events/{id}/banner.{ext}`
4. Update event via `PATCH /events/{id}` dengan `bannerUrl`

## Code Example (Next.js + Firebase SDK)

### Setup Firebase Client

```typescript
// firebase.ts
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
```

### Upload Event Banner

```typescript
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

async function uploadEventBanner(eventId: string, file: File): Promise<string> {
  // Validate ukuran (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File too large (max 5MB)');
  }

  // Validate type
  if (!file.type.startsWith('image/')) {
    throw new Error('Must be an image');
  }

  // Extract extension dari nama file
  const ext = file.name.split('.').pop()?.toLowerCase();
  const path = `events/${eventId}/banner.${ext}`;

  const storageRef = ref(storage, path);

  // Upload (user harus sudah login Firebase Auth)
  await uploadBytes(storageRef, file);

  // Get public download URL
  const downloadUrl = await getDownloadURL(storageRef);
  return downloadUrl;
}

// Pakai:
const url = await uploadEventBanner('evt_abc123', file);
await fetch(`/api/v1/events/evt_abc123`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ bannerUrl: url }),
});
```

### Upload Proposal PDF

```typescript
async function uploadProposal(eventId: string, pdfFile: File): Promise<string> {
  if (pdfFile.size > 10 * 1024 * 1024) {
    throw new Error('File too large (max 10MB)');
  }
  if (pdfFile.type !== 'application/pdf') {
    throw new Error('Must be a PDF');
  }

  const path = `events/${eventId}/proposal.pdf`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, pdfFile);
  const downloadUrl = await getDownloadURL(storageRef);

  // Set proposal di backend
  await fetch(`/api/v1/events/${eventId}/proposal`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'UPLOAD',
      fileUrl: downloadUrl,
    }),
  });

  return downloadUrl;
}
```

## Security Rules Summary

Backend membatasi upload dengan rules:
- User harus authenticated (Firebase Auth login)
- File harus sesuai MIME type yang diizinkan
- File harus di bawah size limit
- Backend SECARA TAMBAHAN validate ownership saat URL dikirim (mencegah user upload ke event milik orang lain)

## Common Errors

| Error | Penyebab | Solusi |
|-------|----------|--------|
| `storage/unauthorized` | User belum login Firebase | Pastikan `signInWithEmailAndPassword` selesai |
| `storage/unauthenticated` | Token expired | Refresh token via `getIdToken(true)` |
| `storage/object-not-found` | Path salah | Cek format path sesuai tabel di atas |
| `400 from backend` | URL bukan dari Firebase Storage project ini | Pastikan upload selesai dan URL valid sebelum kirim |