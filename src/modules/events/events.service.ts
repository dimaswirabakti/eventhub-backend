import { prisma } from '@/config/database.js';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/common/errors/app-error.js';
import { generateUniqueSlug } from '@/common/utils/slug.js';
import { StatusCodes } from 'http-status-codes';
import type {
  CatalogFilter,
  CreateEventInput,
  CreateTierInput,
  SetProposalInput,
  UpdateEventInput,
  UpdateTierInput,
} from './events.schema.js';
import { Prisma } from '@prisma/client';
import { embedEvent } from '@/modules/matchmaking/matchmaking.service.js';
import { deleteStorageFile } from '@/common/utils/storage.js';
import { logger } from '@/config/logger.js';

// Helper: bersihkan optional field undefined sebelum kirim ke Prisma
const stripUndefined = <T extends Record<string, unknown>>(
  obj: T
): { [K in keyof T]: Exclude<T[K], undefined> } => {
  const result = {} as { [K in keyof T]: Exclude<T[K], undefined> };
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key] as Exclude<T[typeof key], undefined>;
    }
  }
  return result;
};

// Get EO profile dari userId. Throw kalau bukan EO atau profile belum dibuat.
const getEoProfile = async (userId: string) => {
  const profile = await prisma.eOProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new ForbiddenError('EO profile not found. Complete registration first.');
  }
  return profile;
};

// Cek event ownership. Throw ForbiddenError kalau bukan owner.
const assertEventOwnership = async (eventId: string, userId: string) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { eoProfile: true },
  });
  if (!event) throw new NotFoundError('Event');
  if (event.eoProfile.userId !== userId) {
    throw new ForbiddenError('You do not own this event');
  }
  return event;
};

// CREATE EVENT
export const createEvent = async (userId: string, input: CreateEventInput) => {
  const eoProfile = await getEoProfile(userId);

  const slug = generateUniqueSlug(input.title);

  // Strip undefined dari optional fields
  const data: Prisma.EventUncheckedCreateInput = {
    eoProfileId: eoProfile.id,
    title: input.title,
    slug,
    description: input.description,
    category: input.category,
    startDate: input.startDate,
    endDate: input.endDate,
    city: input.city,
    isOnline: input.isOnline,
    expectedAttendees: input.expectedAttendees,
    audienceAgeMin: input.audienceAgeMin,
    audienceAgeMax: input.audienceAgeMax,
    audienceInterests: input.audienceInterests,
    ...(input.theme !== undefined && { theme: input.theme }),
    ...(input.bannerUrl !== undefined && { bannerUrl: input.bannerUrl }),
    ...(input.venue !== undefined && { venue: input.venue }),
  };

  return prisma.event.create({ data });
};

// LIST MY EVENTS (untuk EO)
export const listMyEvents = async (userId: string) => {
  const eoProfile = await getEoProfile(userId);

  return prisma.event.findMany({
    where: { eoProfileId: eoProfile.id },
    include: {
      tiers: true,
      proposal: { select: { id: true, source: true, aiScore: true } },
      _count: { select: { offers: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
};

// GET MY EVENT BY ID (untuk owner, semua status)
export const getMyEvent = async (userId: string, eventId: string) => {
  await assertEventOwnership(eventId, userId);

  return prisma.event.findUnique({
    where: { id: eventId },
    include: {
      tiers: { orderBy: { price: 'desc' } },
      proposal: true,
      offers: {
        include: {
          companyProfile: {
            select: { id: true, companyName: true, industry: true, logoUrl: true },
          },
          tier: { select: { name: true, price: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
};

// UPDATE EVENT
export const updateEvent = async (userId: string, eventId: string, input: UpdateEventInput) => {
  const existing = await assertEventOwnership(eventId, userId);

  const newStart = input.startDate ?? existing.startDate;
  const newEnd = input.endDate ?? existing.endDate;
  if (newEnd < newStart) {
    throw new ValidationError('endDate must be after or equal to startDate');
  }

  const newAgeMin = input.audienceAgeMin ?? existing.audienceAgeMin;
  const newAgeMax = input.audienceAgeMax ?? existing.audienceAgeMax;
  if (newAgeMax < newAgeMin) {
    throw new ValidationError('audienceAgeMax must be >= audienceAgeMin');
  }

  const updateData = stripUndefined(input);
  if (input.title && input.title !== existing.title) {
    (updateData as Prisma.EventUpdateInput).slug = generateUniqueSlug(input.title);
  }

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: updateData,
  });

  // Re-embed kalau event sudah published & field embed-relevant berubah
  const embedRelevantFields: Array<keyof UpdateEventInput> = [
    'title',
    'description',
    'category',
    'theme',
    'audienceInterests',
    'audienceAgeMin',
    'audienceAgeMax',
    'expectedAttendees',
    'city',
    'isOnline',
  ];
  const hasRelevantChange = embedRelevantFields.some((field) => input[field] !== undefined);

  if (existing.status === 'PUBLISHED' && hasRelevantChange) {
    void embedEvent(eventId);
  }

  return updated;
};

// DELETE EVENT
export const deleteEvent = async (userId: string, eventId: string) => {
  const event = await assertEventOwnership(eventId, userId);

  // Cek kalau ada offer yang ACCEPTED, tidak boleh dihapus
  const acceptedOffers = await prisma.sponsorshipOffer.count({
    where: { eventId, status: 'ACCEPTED' },
  });
  if (acceptedOffers > 0) {
    throw new AppError(
      'Cannot delete event with accepted offers. Close it instead.',
      StatusCodes.CONFLICT
    );
  }

  // Ambil file URLs sebelum delete (untuk cleanup storage)
  const proposal = await prisma.proposal.findUnique({
    where: { eventId },
    select: { fileUrl: true },
  });

  await prisma.event.delete({ where: { id: eventId } });

  if (event.bannerUrl) {
    void deleteStorageFile(event.bannerUrl).catch((err: unknown) => {
      logger.error({ err, eventId }, 'Failed to cleanup event banner');
    });
  }
  // Proposal PDF
  if (proposal?.fileUrl) {
    void deleteStorageFile(proposal.fileUrl).catch((err: unknown) => {
      logger.error({ err, eventId }, 'Failed to cleanup proposal file');
    });
  }

  return { id: event.id, deleted: true };
};

// Hapus banner dari storage dan set bannerUrl null di DB.
export const deleteEventBanner = async (userId: string, eventId: string) => {
  const event = await assertEventOwnership(eventId, userId);

  if (!event.bannerUrl) {
    throw new AppError('Event has no banner to delete', StatusCodes.CONFLICT);
  }

  void deleteStorageFile(event.bannerUrl).catch((err: unknown) => {
    logger.error({ err, eventId }, 'Failed to delete banner file from storage');
  });

  const updated = await prisma.event.update({
    where: { id: eventId },
    data: { bannerUrl: null },
  });

  return updated;
};

// PUBLISH EVENT
export const publishEvent = async (userId: string, eventId: string) => {
  const event = await assertEventOwnership(eventId, userId);

  if (event.status === 'PUBLISHED') {
    throw new AppError('Event is already published', StatusCodes.CONFLICT);
  }
  if (event.status === 'CANCELLED') {
    throw new AppError('Cannot publish a cancelled event', StatusCodes.CONFLICT);
  }

  // Pre-flight check
  const tierCount = await prisma.sponsorshipTier.count({ where: { eventId } });
  if (tierCount === 0) {
    throw new ValidationError('Event must have at least 1 sponsorship tier before publishing');
  }

  const hasProposal = await prisma.proposal.findUnique({ where: { eventId } });
  if (!hasProposal) {
    throw new ValidationError('Event must have a proposal before publishing');
  }

  const publishedEvent = await prisma.event.update({
    where: { id: eventId },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  // Fire-and-forget: generate embedding di background
  // Tidak di-await supaya response cepat (embedding butuh ~1-2 detik)
  void embedEvent(eventId);

  return publishedEvent;
};

// CLOSE EVENT
export const closeEvent = async (userId: string, eventId: string) => {
  const event = await assertEventOwnership(eventId, userId);
  if (event.status === 'CLOSED') {
    throw new AppError('Event is already closed', StatusCodes.CONFLICT);
  }

  return prisma.event.update({
    where: { id: eventId },
    data: { status: 'CLOSED' },
  });
};

// TIER MANAGEMENT
export const createTier = async (userId: string, eventId: string, input: CreateTierInput) => {
  await assertEventOwnership(eventId, userId);

  return prisma.sponsorshipTier.create({
    data: {
      eventId,
      name: input.name,
      price: input.price,
      benefits: input.benefits,
      maxSlots: input.maxSlots,
    },
  });
};

export const updateTier = async (
  userId: string,
  eventId: string,
  tierId: string,
  input: UpdateTierInput
) => {
  await assertEventOwnership(eventId, userId);

  const tier = await prisma.sponsorshipTier.findUnique({ where: { id: tierId } });
  if (!tier || tier.eventId !== eventId) {
    throw new NotFoundError('Sponsorship tier');
  }

  return prisma.sponsorshipTier.update({
    where: { id: tierId },
    data: stripUndefined(input),
  });
};

export const deleteTier = async (userId: string, eventId: string, tierId: string) => {
  await assertEventOwnership(eventId, userId);

  const tier = await prisma.sponsorshipTier.findUnique({
    where: { id: tierId },
    include: { _count: { select: { offers: true } } },
  });
  if (!tier || tier.eventId !== eventId) {
    throw new NotFoundError('Sponsorship tier');
  }
  if (tier._count.offers > 0) {
    throw new AppError('Cannot delete tier with existing offers', StatusCodes.CONFLICT);
  }

  await prisma.sponsorshipTier.delete({ where: { id: tierId } });
  return { id: tierId, deleted: true };
};

// PROPOSAL MANAGEMENT
export const setProposal = async (userId: string, eventId: string, input: SetProposalInput) => {
  await assertEventOwnership(eventId, userId);

  const data = {
    source: input.source,
    ...(input.fileUrl !== undefined && { fileUrl: input.fileUrl }),
    ...(input.content !== undefined && { content: input.content }),
  };

  // Upsert: kalau sudah ada, update; kalau belum, create
  return prisma.proposal.upsert({
    where: { eventId },
    create: { eventId, ...data },
    update: data,
  });
};

// Update content draft proposal, hanya yg source nya GENERATED.
export const updateProposalContent = async (userId: string, eventId: string, content: string) => {
  await assertEventOwnership(eventId, userId);

  const proposal = await prisma.proposal.findUnique({ where: { eventId } });
  if (!proposal) {
    throw new NotFoundError('Proposal');
  }
  if (proposal.source !== 'GENERATED') {
    throw new AppError('Only AI-generated proposals can be edited as draft', StatusCodes.CONFLICT);
  }

  return prisma.proposal.update({
    where: { eventId },
    data: {
      content,
      // Reset AI review karena content berubah
      aiScore: null,
      aiFeedback: Prisma.JsonNull,
    },
  });
};

// PUBLIC CATALOG
export const listPublicCatalog = async (filter: CatalogFilter) => {
  const where: Prisma.EventWhereInput = {
    status: 'PUBLISHED',
    endDate: { gte: new Date() }, // hide expired
  };

  if (filter.category) where.category = filter.category;
  if (filter.city) where.city = { contains: filter.city, mode: 'insensitive' };
  if (filter.isOnline !== undefined) where.isOnline = filter.isOnline;
  if (filter.minAttendees) where.expectedAttendees = { gte: filter.minAttendees };
  if (filter.maxAttendees) {
    where.expectedAttendees = {
      ...((where.expectedAttendees as object) ?? {}),
      lte: filter.maxAttendees,
    };
  }
  if (filter.search) {
    where.OR = [
      { title: { contains: filter.search, mode: 'insensitive' } },
      { description: { contains: filter.search, mode: 'insensitive' } },
    ];
  }

  const skip = (filter.page - 1) * filter.limit;

  const [events, total] = await Promise.all([
    prisma.event.findMany({
      where,
      include: {
        eoProfile: {
          select: { id: true, organizationName: true, campus: true, logoUrl: true },
        },
        tiers: {
          select: { id: true, name: true, price: true },
          orderBy: { price: 'desc' },
        },
        _count: { select: { offers: true } },
      },
      orderBy: { publishedAt: 'desc' },
      skip,
      take: filter.limit,
    }),
    prisma.event.count({ where }),
  ]);

  return {
    data: events,
    pagination: {
      page: filter.page,
      limit: filter.limit,
      total,
      totalPages: Math.ceil(total / filter.limit),
    },
  };
};

export const getPublicEventBySlug = async (slug: string) => {
  const event = await prisma.event.findUnique({
    where: { slug },
    include: {
      eoProfile: {
        select: {
          id: true,
          organizationName: true,
          organizationType: true,
          campus: true,
          city: true,
          logoUrl: true,
          isVerified: true,
        },
      },
      tiers: { orderBy: { price: 'desc' } },
      proposal: { select: { source: true, fileUrl: true } },
    },
  });

  if (!event || event.status !== 'PUBLISHED') {
    throw new NotFoundError('Event');
  }

  return event;
};
