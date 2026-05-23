import midtransClient from 'midtrans-client';
import { env } from './env.js';

// Snap API untuk create transaction
export const snap = new midtransClient.Snap({
  isProduction: env.MIDTRANS_IS_PRODUCTION,
  serverKey: env.MIDTRANS_SERVER_KEY ?? '',
  clientKey: env.MIDTRANS_CLIENT_KEY ?? '',
});

// Core API untuk verifikasi status transaksi
export const coreApi = new midtransClient.CoreApi({
  isProduction: env.MIDTRANS_IS_PRODUCTION,
  serverKey: env.MIDTRANS_SERVER_KEY ?? '',
  clientKey: env.MIDTRANS_CLIENT_KEY ?? '',
});
