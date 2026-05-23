import { prisma } from '@/config/database.js';
import { AppError } from '@/common/errors/app-error.js';
import { StatusCodes } from 'http-status-codes';
import type { TokenFeature, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { snap } from '@/config/midtrans.js';
import { env } from '@/config/env.js';
import { logger } from '@/config/logger.js';
import { getPackage } from './billing.constants.js';
import type { TransactionListQuery } from './billing.schema.js';
import { NotFoundError, ValidationError } from '@/common/errors/app-error.js';

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
  // const client = tx ?? prisma;

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

// CREATE TOPUP TRANSACTION
export const createTopup = async (userId: string, packageId: string) => {
  const pkg = getPackage(packageId);
  if (!pkg) {
    throw new ValidationError('Invalid package ID');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });
  if (!user) throw new NotFoundError('User');

  const orderId = `EVTHUB-${packageId}-${randomUUID()}`;

  // Buat record TokenTransaction
  const transaction = await prisma.tokenTransaction.create({
    data: {
      userId,
      midtransOrderId: orderId,
      packageName: pkg.name,
      tokenAmount: pkg.tokenAmount,
      priceIdr: pkg.priceIdr,
      status: 'PENDING',
    },
  });

  // Request ke Midtrans Snap
  try {
    const snapResponse = await snap.createTransaction({
      transaction_details: {
        order_id: orderId,
        gross_amount: pkg.priceIdr,
      },
      item_details: [
        {
          id: pkg.id,
          price: pkg.priceIdr,
          quantity: 1,
          name: `${pkg.name} - ${pkg.tokenAmount} tokens`,
        },
      ],
      customer_details: {
        first_name: user.name,
        email: user.email,
      },
    });

    return {
      transaction,
      snapToken: snapResponse.token,
      redirectUrl: snapResponse.redirect_url,
    };
  } catch (err) {
    logger.error({ err, orderId }, 'Midtrans createTransaction failed');
    await prisma.tokenTransaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED' },
    });
    throw new AppError('Payment gateway error. Please try again.', StatusCodes.BAD_GATEWAY);
  }
};

// WEBHOOK HANDLER
interface MidtransNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  fraud_status?: string;
  payment_type?: string;
}

// Verifikasi signature webhook Midtrans.
const verifySignature = (notif: MidtransNotification): boolean => {
  const serverKey = env.MIDTRANS_SERVER_KEY ?? '';
  const payload = notif.order_id + notif.status_code + notif.gross_amount + serverKey;
  const computed = createHash('sha512').update(payload).digest('hex');
  return computed === notif.signature_key;
};

// Handle webhook notification dari Midtrans.
export const handleWebhook = async (notif: MidtransNotification) => {
  // Verifikasi signature
  if (!verifySignature(notif)) {
    logger.warn({ orderId: notif.order_id }, 'Invalid webhook signature');
    throw new AppError('Invalid signature', StatusCodes.FORBIDDEN);
  }

  // Cari transaction
  const transaction = await prisma.tokenTransaction.findUnique({
    where: { midtransOrderId: notif.order_id },
  });
  if (!transaction) {
    logger.warn({ orderId: notif.order_id }, 'Transaction not found for webhook');
    throw new NotFoundError('Transaction');
  }

  // kalau sudah SUCCESS, skip
  if (transaction.status === 'SUCCESS') {
    logger.info({ orderId: notif.order_id }, 'Transaction already processed');
    return { processed: true, alreadyDone: true };
  }

  // Tentukan status baru berdasarkan transaction_status Midtrans
  const txStatus = notif.transaction_status;
  const fraudStatus = notif.fraud_status;

  let newStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | 'EXPIRED' | 'CANCELLED' = 'PENDING';
  let shouldAddTokens = false;

  if (txStatus === 'capture') {
    // Untuk credit card
    if (fraudStatus === 'accept') {
      newStatus = 'SUCCESS';
      shouldAddTokens = true;
    } else if (fraudStatus === 'challenge') {
      newStatus = 'PENDING';
    } else {
      newStatus = 'FAILED';
    }
  } else if (txStatus === 'settlement') {
    // Untuk VA, e-wallet, dan QRIS
    newStatus = 'SUCCESS';
    shouldAddTokens = true;
  } else if (txStatus === 'pending') {
    newStatus = 'PENDING';
  } else if (txStatus === 'deny') {
    newStatus = 'FAILED';
  } else if (txStatus === 'expire') {
    newStatus = 'EXPIRED';
  } else if (txStatus === 'cancel') {
    newStatus = 'CANCELLED';
  }

  // Update transaction dan tambah token user
  if (shouldAddTokens) {
    await prisma.$transaction(async (tx) => {
      await tx.tokenTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'SUCCESS',
          paidAt: new Date(),
          ...(notif.payment_type !== undefined && { paymentMethod: notif.payment_type }),
        },
      });

      await tx.user.update({
        where: { id: transaction.userId },
        data: { tokenBalance: { increment: transaction.tokenAmount } },
      });
    });

    logger.info(
      { orderId: notif.order_id, tokens: transaction.tokenAmount, userId: transaction.userId },
      'Tokens added successfully via webhook'
    );
  } else {
    await prisma.tokenTransaction.update({
      where: { id: transaction.id },
      data: { status: newStatus },
    });
  }

  return { processed: true, status: newStatus };
};

// GET TRANSACTION HISTORY
export const getTransactionHistory = async (userId: string, query: TransactionListQuery) => {
  const where = {
    userId,
    ...(query.status && { status: query.status }),
  };

  const skip = (query.page - 1) * query.limit;

  const [transactions, total] = await Promise.all([
    prisma.tokenTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.tokenTransaction.count({ where }),
  ]);

  return {
    data: transactions,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

// LIST PACKAGES
export { TOKEN_PACKAGES } from './billing.constants.js';
