/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { prisma } from '@/config/database.js';
import { AppError, ForbiddenError, NotFoundError } from '@/common/errors/app-error.js';
import { StatusCodes } from 'http-status-codes';
import type { SavedEventsListQuery } from './saved-events.schema.js';

// HELPER
const getCompanyProfile = async (userId: string) => {
  const profile = await prisma.companyProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new ForbiddenError('Company profile not found. Wrong role?');
  }
  return profile;
};

// SAVE EVENT (idempotent)
export const saveEvent = async (userId: string, eventId: string) => {
  const company = await getCompanyProfile(userId);

  // Validate event exists & published
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { id: true, status: true, eoProfile: { select: { userId: true } } },
  });
  if (!event) throw new NotFoundError('Event');

  // Don't allow save event yang status-nya DRAFT (belum public)
  if (event.status === 'DRAFT') {
    throw new AppError('Cannot save a draft event', StatusCodes.CONFLICT);
  }

  // Upsert untuk idempotency: kalau sudah ada, return existing
  const saved = await prisma.savedEvent.upsert({
    where: {
      companyProfileId_eventId: {
        companyProfileId: company.id,
        eventId,
      },
    },
    create: {
      companyProfileId: company.id,
      eventId,
    },
    update: {},
  });

  return saved;
};

// UNSAVE EVENT
export const unsaveEvent = async (userId: string, eventId: string) => {
  const company = await getCompanyProfile(userId);

  // Idempotent: kalau tidak ada, tidak error
  await prisma.savedEvent.deleteMany({
    where: {
      companyProfileId: company.id,
      eventId,
    },
  });

  return { unsaved: true, eventId };
};

// LIST SAVED EVENTS
export const listSavedEvents = async (userId: string, query: SavedEventsListQuery) => {
  const company = await getCompanyProfile(userId);

  const skip = (query.page - 1) * query.limit;

  const [savedEvents, total] = await Promise.all([
    prisma.savedEvent.findMany({
      where: { companyProfileId: company.id },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            slug: true,
            description: true,
            category: true,
            bannerUrl: true,
            startDate: true,
            endDate: true,
            city: true,
            isOnline: true,
            expectedAttendees: true,
            status: true,
            publishedAt: true,
            eoProfile: {
              select: {
                id: true,
                organizationName: true,
                logoUrl: true,
                campus: true,
              },
            },
            tiers: {
              select: { id: true, name: true, price: true },
              orderBy: { price: 'desc' },
            },
            _count: { select: { offers: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: query.limit,
    }),
    prisma.savedEvent.count({ where: { companyProfileId: company.id } }),
  ]);

  // Transform: flatten + add savedAt field
  const data = savedEvents.map((se) => ({
    ...se.event,
    savedAt: se.createdAt,
    isActive: se.event.status === 'PUBLISHED' && se.event.endDate >= new Date(),
  }));

  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
};
