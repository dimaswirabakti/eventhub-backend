import { z } from 'zod';

export const topupSchema = z.object({
  packageId: z.enum(['STARTER', 'PRO', 'PREMIUM']),
});

export const transactionListSchema = z.object({
  status: z.enum(['PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type TopupInput = z.infer<typeof topupSchema>;
export type TransactionListQuery = z.infer<typeof transactionListSchema>;
