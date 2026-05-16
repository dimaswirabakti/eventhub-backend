import { prisma } from '@/config/database.js';
import { logger } from '@/config/logger.js';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/common/errors/app-error.js';
import { StatusCodes } from 'http-status-codes';
import { deductToken } from '@/modules/billing/billing.service.js';
import type { CreateOfferInput, OfferListQuery, RejectOfferInput } from './offers.schema.js';
import type { OfferStatus, Prisma } from '@prisma/client';

// SHARED HELPERS
export const getCompanyProfile = async (userId: string) => {
  const profile = await prisma.companyProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new ForbiddenError('Company profile not found.');
  }
  return profile;
};

export const getEoProfile = async (userId: string) => {
  const profile = await prisma.eOProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new ForbiddenError('EO profile not found.');
  }
  return profile;
};

// Validate event + tier + business rules untuk create offer/pitch.
// Return event + tier yang sudah di-validate.
export const validateEventAndTier = async (
  eventId: string,
  tierId: string,
  expectedEoUserId?: string
) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      tiers: { where: { id: tierId } },
      eoProfile: { select: { userId: true } },
    },
  });

  if (!event) throw new NotFoundError('Event');

  if (event.status !== 'PUBLISHED') {
    throw new AppError(
      `Cannot interact with a ${event.status.toLowerCase()} event`,
      StatusCodes.CONFLICT
    );
  }

  if (event.endDate < new Date()) {
    throw new AppError('Cannot interact with a past event', StatusCodes.CONFLICT);
  }

  // For pitch: validate event milik EO yang inisiasi
  if (expectedEoUserId && event.eoProfile.userId !== expectedEoUserId) {
    throw new ForbiddenError('You can only pitch your own events');
  }

  const tier = event.tiers[0];
  if (!tier) throw new NotFoundError('Sponsorship tier');

  return { event, tier };
};

// Cek apakah tier masih punya slot.
export const assertTierSlotAvailable = async (tierId: string) => {
  const tier = await prisma.sponsorshipTier.findUnique({
    where: { id: tierId },
    select: { name: true, maxSlots: true },
  });
  if (!tier) throw new NotFoundError('Sponsorship tier');

  const acceptedCount = await prisma.sponsorshipOffer.count({
    where: { tierId, status: 'ACCEPTED' },
  });
  if (acceptedCount >= tier.maxSlots) {
    throw new AppError(
      `Tier "${tier.name}" is fully booked (${tier.maxSlots} slot${tier.maxSlots > 1 ? 's' : ''})`,
      StatusCodes.CONFLICT
    );
  }
};

// CREATE OFFER (Company-initiated)
export const createOffer = async (userId: string, input: CreateOfferInput) => {
  const company = await getCompanyProfile(userId);

  const { event, tier } = await validateEventAndTier(input.eventId, input.tierId);

  if (event.eoProfile.userId === userId) {
    throw new ForbiddenError('You cannot offer to your own event');
  }

  await assertTierSlotAvailable(tier.id);

  // Cek existing offer (uniqueness: 1 koneksi per event-company pair)
  const existing = await prisma.sponsorshipOffer.findUnique({
    where: {
      eventId_companyProfileId: {
        eventId: input.eventId,
        companyProfileId: company.id,
      },
    },
  });
  if (existing) {
    throw new AppError(
      `A ${existing.initiatedBy === 'COMPANY' ? 'offer' : 'pitch'} already exists between you and this event (status: ${existing.status})`,
      StatusCodes.CONFLICT
    );
  }

  // Create offer + deduct token atomic
  const offer = await prisma.$transaction(async (tx) => {
    const newOffer = await tx.sponsorshipOffer.create({
      data: {
        eventId: input.eventId,
        companyProfileId: company.id,
        tierId: tier.id,
        status: 'PENDING',
        initiatedBy: 'COMPANY',
        ...(input.message !== undefined && { message: input.message }),
      },
    });

    await deductToken(userId, 'UNLOCK_CONTACT', { referenceId: newOffer.id }, tx);

    return newOffer;
  });

  logger.info(
    { offerId: offer.id, initiatedBy: 'COMPANY', eventId: input.eventId },
    'New offer created'
  );

  return getOfferByIdForCompany(userId, offer.id);
};

// LIST MY OFFERS (Company)
export const listMyOffers = async (userId: string, query: OfferListQuery) => {
  const company = await getCompanyProfile(userId);

  const where: Prisma.SponsorshipOfferWhereInput = {
    companyProfileId: company.id,
    initiatedBy: 'COMPANY',
    ...(query.status && { status: query.status }),
  };

  const skip = (query.page - 1) * query.limit;

  const [offers, total] = await Promise.all([
    prisma.sponsorshipOffer.findMany({
      where,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            category: true,
            bannerUrl: true,
            startDate: true,
            endDate: true,
            city: true,
            eoProfile: {
              select: { organizationName: true, logoUrl: true },
            },
          },
        },
        tier: { select: { name: true, price: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.sponsorshipOffer.count({ where }),
  ]);

  return {
    data: offers,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

// GET OFFER BY ID (Company side)
export const getOfferByIdForCompany = async (userId: string, offerId: string) => {
  const company = await getCompanyProfile(userId);

  const offer = await prisma.sponsorshipOffer.findUnique({
    where: { id: offerId },
    include: {
      event: {
        include: {
          eoProfile: {
            select: {
              id: true,
              organizationName: true,
              campus: true,
              logoUrl: true,
              phoneNumber: true,
              user: { select: { email: true } },
            },
          },
          tiers: { orderBy: { price: 'desc' } },
        },
      },
      tier: true,
      _count: { select: { messages: true } },
    },
  });

  if (!offer) throw new NotFoundError('Offer');
  if (offer.companyProfileId !== company.id) {
    throw new ForbiddenError('You do not own this offer');
  }
  // Filter: hanya offer yang Company-initiated muncul di endpoint Company-side
  // (Pitch yang masuk ke Company punya endpoint terpisah)
  if (offer.initiatedBy !== 'COMPANY') {
    throw new NotFoundError('Offer');
  }

  return offer;
};

// CANCEL OFFER (Company)
export const cancelOffer = async (userId: string, offerId: string) => {
  const company = await getCompanyProfile(userId);

  const offer = await prisma.sponsorshipOffer.findUnique({
    where: { id: offerId },
  });
  if (!offer) throw new NotFoundError('Offer');
  if (offer.companyProfileId !== company.id) {
    throw new ForbiddenError('You do not own this offer');
  }
  if (offer.initiatedBy !== 'COMPANY') {
    throw new ForbiddenError('Use /pitches endpoint for EO-initiated requests');
  }

  const cancellable: OfferStatus[] = ['PENDING', 'UNDER_REVIEW', 'NEGOTIATING'];
  if (!cancellable.includes(offer.status)) {
    throw new AppError(`Cannot cancel offer with status ${offer.status}`, StatusCodes.CONFLICT);
  }

  return prisma.sponsorshipOffer.update({
    where: { id: offerId },
    data: {
      status: 'CANCELLED',
      closedAt: new Date(),
    },
  });
};

// LIST INCOMING OFFERS (EO - incoming dari Company)
export const listIncomingOffers = async (userId: string, query: OfferListQuery) => {
  const eo = await getEoProfile(userId);

  const where: Prisma.SponsorshipOfferWhereInput = {
    event: { eoProfileId: eo.id },
    initiatedBy: 'COMPANY',
    ...(query.status && { status: query.status }),
  };

  const skip = (query.page - 1) * query.limit;

  const [offers, total] = await Promise.all([
    prisma.sponsorshipOffer.findMany({
      where,
      include: {
        event: { select: { id: true, title: true, slug: true } },
        companyProfile: {
          select: {
            id: true,
            companyName: true,
            industry: true,
            logoUrl: true,
            city: true,
          },
        },
        tier: { select: { name: true, price: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: query.limit,
    }),
    prisma.sponsorshipOffer.count({ where }),
  ]);

  return {
    data: offers,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

// GET INCOMING OFFER (EO)
// Auto-update: PENDING -> UNDER_REVIEW
export const getIncomingOffer = async (userId: string, offerId: string) => {
  const eo = await getEoProfile(userId);

  const offer = await prisma.sponsorshipOffer.findUnique({
    where: { id: offerId },
    include: {
      event: { select: { id: true, eoProfileId: true, title: true } },
      companyProfile: {
        include: { user: { select: { email: true } } },
      },
      tier: true,
      _count: { select: { messages: true } },
    },
  });

  if (!offer) throw new NotFoundError('Offer');
  if (offer.event.eoProfileId !== eo.id) {
    throw new ForbiddenError('This offer is not for your event');
  }
  if (offer.initiatedBy !== 'COMPANY') {
    throw new NotFoundError('Offer'); // Pitch ada di endpoint terpisah
  }

  // Auto-update status
  if (offer.status === 'PENDING') {
    return prisma.sponsorshipOffer.update({
      where: { id: offerId },
      data: { status: 'UNDER_REVIEW' },
      include: {
        event: { select: { id: true, eoProfileId: true, title: true } },
        companyProfile: {
          include: { user: { select: { email: true } } },
        },
        tier: true,
        _count: { select: { messages: true } },
      },
    });
  }

  return offer;
};

// ACCEPT OFFER (EO)
export const acceptOffer = async (userId: string, offerId: string) => {
  const eo = await getEoProfile(userId);

  const offer = await prisma.sponsorshipOffer.findUnique({
    where: { id: offerId },
    include: {
      event: { select: { eoProfileId: true } },
      tier: true,
    },
  });
  if (!offer) throw new NotFoundError('Offer');
  if (offer.event.eoProfileId !== eo.id) {
    throw new ForbiddenError('This offer is not for your event');
  }
  if (offer.initiatedBy !== 'COMPANY') {
    throw new ForbiddenError('Use /pitches endpoint for EO-initiated requests');
  }

  const acceptable: OfferStatus[] = ['PENDING', 'UNDER_REVIEW', 'NEGOTIATING'];
  if (!acceptable.includes(offer.status)) {
    throw new AppError(`Cannot accept offer with status ${offer.status}`, StatusCodes.CONFLICT);
  }

  // Re-check slot (mungkin sudah habis sejak offer dibuat)
  const acceptedCount = await prisma.sponsorshipOffer.count({
    where: { tierId: offer.tierId, status: 'ACCEPTED' },
  });
  if (acceptedCount >= offer.tier.maxSlots) {
    throw new ValidationError(`Cannot accept: tier "${offer.tier.name}" is fully booked`);
  }

  return prisma.sponsorshipOffer.update({
    where: { id: offerId },
    data: {
      status: 'ACCEPTED',
      respondedAt: new Date(),
      closedAt: new Date(),
    },
  });
};

// REJECT OFFER (EO)
export const rejectOffer = async (userId: string, offerId: string, input: RejectOfferInput) => {
  const eo = await getEoProfile(userId);

  const offer = await prisma.sponsorshipOffer.findUnique({
    where: { id: offerId },
    include: { event: { select: { eoProfileId: true } } },
  });
  if (!offer) throw new NotFoundError('Offer');
  if (offer.event.eoProfileId !== eo.id) {
    throw new ForbiddenError('This offer is not for your event');
  }
  if (offer.initiatedBy !== 'COMPANY') {
    throw new ForbiddenError('Use /pitches endpoint for EO-initiated requests');
  }

  const rejectable: OfferStatus[] = ['PENDING', 'UNDER_REVIEW', 'NEGOTIATING'];
  if (!rejectable.includes(offer.status)) {
    throw new AppError(`Cannot reject offer with status ${offer.status}`, StatusCodes.CONFLICT);
  }

  return prisma.sponsorshipOffer.update({
    where: { id: offerId },
    data: {
      status: 'REJECTED',
      respondedAt: new Date(),
      closedAt: new Date(),
      ...(input.reason !== undefined && {
        message: `${offer.message ?? ''}\n\n[REJECTED] ${input.reason}`.trim(),
      }),
    },
  });
};
