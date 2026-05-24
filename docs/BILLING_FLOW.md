```
1. Company/EO klik "Top-up 150 token"

2. POST /billing/topup { packageId: "PRO" }

3. Backend:
   - Buat TokenTransaction (status: PENDING)
   - Request ke Midtrans -> dapat snap token + redirect URL
   - Return snap token ke frontend

4. Frontend buka Snap popup (pakai snap.js + clientKey)

5. User bayar (sandbox: pakai kartu/VA dummy)

6. Midtrans kirim WEBHOOK ke backend -> POST /billing/webhook

7. Backend:
   - Verifikasi signature (security!)
   - Cek status transaksi
   - Kalau settlement/capture -> update TokenTransaction (SUCCESS) dan tambahkan tokenBalance

8. User token bertambah.
```
Penambahan token hanya terjadi di webhook handler.