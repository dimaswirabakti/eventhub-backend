import { prisma } from '@/config/database.js';
import { logger } from '@/config/logger.js';
import { AppError, ForbiddenError, NotFoundError } from '@/common/errors/app-error.js';
import { StatusCodes } from 'http-status-codes';
import type { MessageListQuery } from './messages.schema.js';
import type { OfferStatus } from '@prisma/client';

// Status di mana chat masih boleh kirim pesan baru
const CHATTABLE_STATUSES: OfferStatus[] = ['PENDING', 'UNDER_REVIEW', 'NEGOTIATING'];

// Resolve offer dan verifikasi bahwa user adalah EO owner atau Company.
const resolveOfferParticipant = async (userId: string, offerId: string) => {
  const offer = await prisma.sponsorshipOffer.findUnique({
    where: { id: offerId },
    include: {
      event: { select: { eoProfile: { select: { userId: true } } } },
      companyProfile: { select: { userId: true } },
    },
  });

  if (!offer) throw new NotFoundError('Offer');

  const eoUserId = offer.event.eoProfile.userId;
  const companyUserId = offer.companyProfile.userId;

  if (userId !== eoUserId && userId !== companyUserId) {
    throw new ForbiddenError('You are not a participant of this offer');
  }

  const senderRole: 'EO' | 'COMPANY' = userId === eoUserId ? 'EO' : 'COMPANY';

  return { offer, eoUserId, companyUserId, senderRole };
};

// SEND MESSAGE
export const sendMessage = async (userId: string, offerId: string, content: string) => {
  const { offer } = await resolveOfferParticipant(userId, offerId);

  // Cek apakah masih bisa chat
  if (!CHATTABLE_STATUSES.includes(offer.status)) {
    throw new AppError(
      `Cannot send messages on a ${offer.status.toLowerCase()} offer`,
      StatusCodes.CONFLICT
    );
  }

  // Kirim pesan dan (kalau perlu) update status ke NEGOTIATING
  const message = await prisma.$transaction(async (tx) => {
    const newMessage = await tx.message.create({
      data: {
        offerId,
        senderId: userId,
        content,
      },
    });

    // kalau status masih PENDING/UNDER_REVIEW, ubah ke NEGOTIATING
    if (offer.status === 'PENDING' || offer.status === 'UNDER_REVIEW') {
      await tx.sponsorshipOffer.update({
        where: { id: offerId },
        data: { status: 'NEGOTIATING' },
      });
    }

    return newMessage;
  });

  logger.info({ offerId, senderId: userId }, 'Message sent');

  return message;
};

// LIST MESSAGES dan auto mark-as-read
export const listMessages = async (userId: string, offerId: string, query: MessageListQuery) => {
  await resolveOfferParticipant(userId, offerId);

  const skip = (query.page - 1) * query.limit;

  const [messages, total] = await Promise.all([
    prisma.message.findMany({
      where: { offerId },
      include: {
        sender: { select: { id: true, name: true, role: true } },
      },
      orderBy: { createdAt: 'asc' }, // chat: oldest first
      skip,
      take: query.limit,
    }),
    prisma.message.count({ where: { offerId } }),
  ]);

  // Auto mark-as-read
  await prisma.message.updateMany({
    where: {
      offerId,
      senderId: { not: userId },
      isRead: false,
    },
    data: { isRead: true },
  });

  return {
    data: messages,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};
