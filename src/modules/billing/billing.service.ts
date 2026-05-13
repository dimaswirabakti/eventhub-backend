import { prisma } from '@/config/database.js';
import { AppError } from '@/common/errors/app-error.js';
import { StatusCodes } from 'http-status-codes';
import type { TokenFeature, Prisma } from '@prisma/client';

// TOKEN PRICING
export const TOKEN_COSTS: Record<TokenFeature, number> = {
  PROPOSAL_BUILDER: 5,
  SMART_REVIEW: 3,
  UNLOCK_CONTACT: 2,
};

// DEDUCT TOKEN (untuk pakai fitur premium)
export const deductToken = async (
  userId: string,
  feature: TokenFeature,
  metadata?: {
    referenceId?: string;
    extra?: Record<string, unknown>;
  },
  tx?: Prisma.TransactionClient
) => {
  const cost = TOKEN_COSTS[feature];
  const client = tx ?? prisma;

  // Function untuk dijalankan, baik dalam atau luar transaction
  const operation = async (client: Prisma.TransactionClient) => {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true },
    });
    if (!user) {
      throw new AppError('User not found', StatusCodes.NOT_FOUND);
    }
    if (user.tokenBalance < cost) {
      throw new AppError(
        `Insufficient tokens. Required: ${cost}, Available: ${user.tokenBalance}`,
        StatusCodes.PAYMENT_REQUIRED
      );
    }

    // Deduct + log dalam transaction
    const updatedUser = await client.user.update({
      where: { id: userId },
      data: { tokenBalance: { decrement: cost } },
      select: { tokenBalance: true },
    });

    await client.tokenUsage.create({
      data: {
        userId,
        feature,
        cost,
        ...(metadata?.referenceId !== undefined && { referenceId: metadata.referenceId }),
        ...(metadata?.extra !== undefined && {
          metadata: metadata.extra as Prisma.InputJsonValue,
        }),
      },
    });

    return { newBalance: updatedUser.tokenBalance, costPaid: cost };
  };

  // Kalau sudah dalam transaction, pakai client yang ada. kalau belum, bikin baru
  if (tx) {
    return operation(tx);
  }
  return prisma.$transaction(operation);
};

// GET BALANCE
export const getBalance = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenBalance: true },
  });
  if (!user) throw new AppError('User not found', StatusCodes.NOT_FOUND);
  return user.tokenBalance;
};

// LIST TOKEN USAGE HISTORY
export const getUsageHistory = async (userId: string, limit = 50) => {
  return prisma.tokenUsage.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
};
