import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '@/common/utils/async-handler.js';
import { UnauthorizedError } from '@/common/errors/app-error.js';
import * as billingService from './billing.service.js';
import { TOKEN_PACKAGES } from './billing.constants.js';
import type { TopupInput, TransactionListQuery } from './billing.schema.js';

const getQuery = (res: Response): TransactionListQuery => {
  return res.locals.query as TransactionListQuery;
};

// list pilihan paket
export const listPackages = (_req: Request, res: Response): void => {
  res.json({ success: true, data: Object.values(TOKEN_PACKAGES) });
};

// saldo token user
export const getBalance = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const balance = await billingService.getBalance(req.user.id);
  res.json({ success: true, data: { tokenBalance: balance } });
});

// buat transaksi top-up
export const topup = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { packageId } = req.body as TopupInput;
  const result = await billingService.createTopup(req.user.id, packageId);
  res.status(StatusCodes.CREATED).json({ success: true, data: result });
});

// Midtrans notification (tidak perlu authentification, verified by signature)
export const webhook = asyncHandler(async (req: Request, res: Response) => {
  const result = await billingService.handleWebhook(req.body as never);
  res.json({ success: true, ...result });
});

// riwayat transaksi
export const transactions = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await billingService.getTransactionHistory(req.user.id, getQuery(res));
  res.json({ success: true, ...result });
});

// riwayat pemakaian token
export const usage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const history = await billingService.getUsageHistory(req.user.id);
  res.json({ success: true, data: history });
});
