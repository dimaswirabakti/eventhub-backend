import { prisma } from '@/config/database.js';
import { logger } from '@/config/logger.js';
import { AppError, ForbiddenError, NotFoundError } from '@/common/errors/app-error.js';
import { StatusCodes } from 'http-status-codes';
import { deductToken } from '@/modules/billing/billing.service.js';
import type { CreatePitchInput, OfferListQuery, RejectOfferInput } from './offers.schema.js';
import type { OfferStatus, Prisma } from '@prisma/client';
import {
  assertTierSlotAvailable,
  getCompanyProfile,
  getEoProfile,
  validateEventAndTier,
} from './offers.service.js';

// CREATE PITCH (EO-initiated)
export const createPitch = async (userId: string, input: CreatePitchInput) => {
  const eo = await getEoProfile(userId);

  // Validate: event milik EO yang pitch dan masih published
  const validateResult = await validateEventAndTier(input.eventId, input.tierId, userId);
  const tier = validateResult.tier;
  // const event = validateResult.event;

  // Validate target company exists
  const targetCompany = await prisma.companyProfile.findUnique({
    where: { id: input.companyProfileId },
    include: { user: { select: { isActive: true } } },
  });
  if (!targetCompany) {
    throw new NotFoundError('Target company');
  }
  if (!targetCompany.user.isActive) {
    throw new AppError('Target company is inactive', StatusCodes.CONFLICT);
  }

  await assertTierSlotAvailable(tier.id);

  // Cek existing (uniqueness: 1 koneksi per event-company pair, regardless of who initiated)
  const existing = await prisma.sponsorshipOffer.findUnique({
    where: {
      eventId_companyProfileId: {
        eventId: input.eventId,
        companyProfileId: input.companyProfileId,
      },
    },
  });
  if (existing) {
    throw new AppError(
      `A ${existing.initiatedBy === 'EO' ? 'pitch' : 'offer'} already exists between this event and company (status: ${existing.status})`,
      StatusCodes.CONFLICT
    );
  }

  // Create pitch + deduct token
  const pitch = await prisma.$transaction(async (tx) => {
    const newPitch = await tx.sponsorshipOffer.create({
      data: {
        eventId: input.eventId,
        companyProfileId: input.companyProfileId,
        tierId: tier.id,
        status: 'PENDING',
        initiatedBy: 'EO',
        message: input.message,
      },
    });

    await deductToken(userId, 'UNLOCK_CONTACT', { referenceId: newPitch.id }, tx);

    return newPitch;
  });

  // Use eo variable to suppress unused warning
  logger.info(
    {
      pitchId: pitch.id,
      eoProfileId: eo.id,
      eventId: input.eventId,
      targetCompanyId: input.companyProfileId,
    },
    'New pitch created'
  );

  return getPitchByIdForEo(userId, pitch.id);
};

// LIST MY PITCHES (EO)
export const listMyPitches = async (userId: string, query: OfferListQuery) => {
  const eo = await getEoProfile(userId);

  const where: Prisma.SponsorshipOfferWhereInput = {
    event: { eoProfileId: eo.id },
    initiatedBy: 'EO',
    ...(query.status && { status: query.status }),
  };

  const skip = (query.page - 1) * query.limit;

  const [pitches, total] = await Promise.all([
    prisma.sponsorshipOffer.findMany({
      where,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            bannerUrl: true,
            startDate: true,
            endDate: true,
          },
        },
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
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.sponsorshipOffer.count({ where }),
  ]);

  return {
    data: pitches,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

// GET PITCH BY ID (EO side)
export const getPitchByIdForEo = async (userId: string, pitchId: string) => {
  const eo = await getEoProfile(userId);

  const pitch = await prisma.sponsorshipOffer.findUnique({
    where: { id: pitchId },
    include: {
      event: {
        include: {
          tiers: { orderBy: { price: 'desc' } },
        },
      },
      companyProfile: {
        include: { user: { select: { email: true } } },
      },
      tier: true,
      _count: { select: { messages: true } },
    },
  });

  if (!pitch) throw new NotFoundError('Pitch');
  if (pitch.event.eoProfileId !== eo.id) {
    throw new ForbiddenError('This pitch is not yours');
  }
  if (pitch.initiatedBy !== 'EO') {
    throw new NotFoundError('Pitch');
  }

  return pitch;
};

// CANCEL PITCH (EO)
export const cancelPitch = async (userId: string, pitchId: string) => {
  const eo = await getEoProfile(userId);

  const pitch = await prisma.sponsorshipOffer.findUnique({
    where: { id: pitchId },
    include: { event: { select: { eoProfileId: true } } },
  });
  if (!pitch) throw new NotFoundError('Pitch');
  if (pitch.event.eoProfileId !== eo.id) {
    throw new ForbiddenError('This pitch is not yours');
  }
  if (pitch.initiatedBy !== 'EO') {
    throw new ForbiddenError('Use /offers endpoint for Company-initiated offers');
  }

  const cancellable: OfferStatus[] = ['PENDING', 'UNDER_REVIEW', 'NEGOTIATING'];
  if (!cancellable.includes(pitch.status)) {
    throw new AppError(`Cannot cancel pitch with status ${pitch.status}`, StatusCodes.CONFLICT);
  }

  return prisma.sponsorshipOffer.update({
    where: { id: pitchId },
    data: { status: 'CANCELLED', closedAt: new Date() },
  });
};

// LIST INCOMING PITCHES (Company - incoming dari EO)
export const listIncomingPitches = async (userId: string, query: OfferListQuery) => {
  const company = await getCompanyProfile(userId);

  const where: Prisma.SponsorshipOfferWhereInput = {
    companyProfileId: company.id,
    initiatedBy: 'EO',
    ...(query.status && { status: query.status }),
  };

  const skip = (query.page - 1) * query.limit;

  const [pitches, total] = await Promise.all([
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
            expectedAttendees: true,
            eoProfile: {
              select: { id: true, organizationName: true, campus: true, logoUrl: true },
            },
          },
        },
        tier: { select: { name: true, price: true, benefits: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: query.limit,
    }),
    prisma.sponsorshipOffer.count({ where }),
  ]);

  return {
    data: pitches,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};

// GET INCOMING PITCH (Company)
// Auto-update: PENDING -> UNDER_REVIEW
export const getIncomingPitch = async (userId: string, pitchId: string) => {
  const company = await getCompanyProfile(userId);

  const pitch = await prisma.sponsorshipOffer.findUnique({
    where: { id: pitchId },
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

  if (!pitch) throw new NotFoundError('Pitch');
  if (pitch.companyProfileId !== company.id) {
    throw new ForbiddenError('This pitch is not for you');
  }
  if (pitch.initiatedBy !== 'EO') {
    throw new NotFoundError('Pitch');
  }

  if (pitch.status === 'PENDING') {
    return prisma.sponsorshipOffer.update({
      where: { id: pitchId },
      data: { status: 'UNDER_REVIEW' },
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
  }

  return pitch;
};

// ACCEPT PITCH (Company)
export const acceptPitch = async (userId: string, pitchId: string) => {
  const company = await getCompanyProfile(userId);

  const pitch = await prisma.sponsorshipOffer.findUnique({
    where: { id: pitchId },
    include: { tier: true },
  });
  if (!pitch) throw new NotFoundError('Pitch');
  if (pitch.companyProfileId !== company.id) {
    throw new ForbiddenError('This pitch is not for you');
  }
  if (pitch.initiatedBy !== 'EO') {
    throw new ForbiddenError('Use /offers endpoint for Company-initiated offers');
  }

  const acceptable: OfferStatus[] = ['PENDING', 'UNDER_REVIEW', 'NEGOTIATING'];
  if (!acceptable.includes(pitch.status)) {
    throw new AppError(`Cannot accept pitch with status ${pitch.status}`, StatusCodes.CONFLICT);
  }

  await assertTierSlotAvailable(pitch.tierId);

  return prisma.sponsorshipOffer.update({
    where: { id: pitchId },
    data: {
      status: 'ACCEPTED',
      respondedAt: new Date(),
      closedAt: new Date(),
    },
  });
};

// REJECT PITCH (Company)
export const rejectPitch = async (userId: string, pitchId: string, input: RejectOfferInput) => {
  const company = await getCompanyProfile(userId);

  const pitch = await prisma.sponsorshipOffer.findUnique({
    where: { id: pitchId },
  });
  if (!pitch) throw new NotFoundError('Pitch');
  if (pitch.companyProfileId !== company.id) {
    throw new ForbiddenError('This pitch is not for you');
  }
  if (pitch.initiatedBy !== 'EO') {
    throw new ForbiddenError('Use /offers endpoint for Company-initiated offers');
  }

  const rejectable: OfferStatus[] = ['PENDING', 'UNDER_REVIEW', 'NEGOTIATING'];
  if (!rejectable.includes(pitch.status)) {
    throw new AppError(`Cannot reject pitch with status ${pitch.status}`, StatusCodes.CONFLICT);
  }

  return prisma.sponsorshipOffer.update({
    where: { id: pitchId },
    data: {
      status: 'REJECTED',
      respondedAt: new Date(),
      closedAt: new Date(),
      ...(input.reason !== undefined && {
        message: `${pitch.message ?? ''}\n\n[REJECTED] ${input.reason}`.trim(),
      }),
    },
  });
};
