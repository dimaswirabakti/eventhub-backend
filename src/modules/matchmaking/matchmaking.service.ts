import { prisma } from '@/config/database.js';
import { logger } from '@/config/logger.js';
import { generateEmbedding } from '@/modules/ai/ai.service.js';
import { composeCompanyText, composeEventText } from './composer.js';
import { saveCompanyEmbedding, saveEventEmbedding } from './vector.repository.js';
import { searchSimilarCompanies, searchSimilarEvents } from './search.repository.js';
import { scoreCompanyForEvent, scoreEventForCompany } from './scorer.js';
import { ForbiddenError, NotFoundError } from '@/common/errors/app-error.js';

/**
 * EVENT EMBEDDING
 * Generate dan save embedding untuk Event.
 * Dipanggil saat event di-publish atau di-update setelah published.
 */
export const embedEvent = async (eventId: string): Promise<void> => {
  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      logger.warn({ eventId }, 'embedEvent: event not found');
      return;
    }

    const text = composeEventText(event);
    logger.debug({ eventId, textLength: text.length }, 'Generating event embedding');

    const embedding = await generateEmbedding(text);
    await saveEventEmbedding(eventId, embedding);

    logger.info({ eventId }, 'Event embedding saved successfully');
  } catch (err) {
    logger.error({ err, eventId }, 'Failed to embed event');
  }
};

/**
 * COMPANY EMBEDDING
 * Generate dan save embedding untuk CompanyProfile.
 * Dipanggil saat company profile dibuat atau diupdate.
 */
export const embedCompanyProfile = async (companyProfileId: string): Promise<void> => {
  try {
    const company = await prisma.companyProfile.findUnique({
      where: { id: companyProfileId },
    });
    if (!company) {
      logger.warn({ companyProfileId }, 'embedCompanyProfile: not found');
      return;
    }

    const text = composeCompanyText(company);
    logger.debug({ companyProfileId, textLength: text.length }, 'Generating company embedding');

    const embedding = await generateEmbedding(text);
    await saveCompanyEmbedding(companyProfileId, embedding);

    logger.info({ companyProfileId }, 'Company embedding saved successfully');
  } catch (err) {
    logger.error({ err, companyProfileId }, 'Failed to embed company');
  }
};

// RECOMMENDATIONS

const DEFAULT_THRESHOLD = 0.6;
const DEFAULT_LIMIT = 20;

// Cari event yang cocok untuk Company.
// Hanya untuk user dengan role COMPANY yang punya profile + embedding.
export const recommendEventsForCompany = async (
  userId: string,
  options?: { limit?: number; threshold?: number }
) => {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;

  // Get company profile + cek embedding
  const company = await prisma.companyProfile.findUnique({
    where: { userId },
  });
  if (!company) {
    throw new NotFoundError('Company profile');
  }

  // Cek embedding via raw query (Prisma tidak bisa baca tipe vector)
  const embeddingRow = await prisma.$queryRawUnsafe<{ embedding: number[] | null }[]>(
    `SELECT embedding::real[] AS embedding FROM company_profiles WHERE id = $1`,
    company.id
  );

  const embedding = embeddingRow[0]?.embedding;
  if (!embedding || embedding.length === 0) {
    logger.warn({ companyProfileId: company.id }, 'Company has no embedding yet');
    // Trigger re-embed di background
    void embedCompanyProfile(company.id);
    return {
      recommendations: [],
      meta: {
        message: 'Profile is being analyzed. Please try again in a few seconds.',
        threshold,
      },
    };
  }

  // Search similar events via pgvector
  const candidates = await searchSimilarEvents(embedding, limit * 2, threshold);

  // Score & sort dengan hybrid logic
  const scored = candidates
    .map((event) => scoreEventForCompany(event, company))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);

  return {
    recommendations: scored,
    meta: {
      total: scored.length,
      threshold,
      semanticWeight: 0.7,
    },
  };
};

//  * Cari Company yang cocok jadi sponsor untuk Event tertentu.
//  * Hanya untuk EO owner event.
export const recommendSponsorsForEvent = async (
  userId: string,
  eventId: string,
  options?: { limit?: number; threshold?: number }
) => {
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const threshold = options?.threshold ?? DEFAULT_THRESHOLD;

  // Get event + cek ownership
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { eoProfile: { select: { userId: true } } },
  });
  if (!event) {
    throw new NotFoundError('Event');
  }
  if (event.eoProfile.userId !== userId) {
    throw new ForbiddenError('You do not own this event');
  }

  // Get embedding event
  const embeddingRow = await prisma.$queryRawUnsafe<{ embedding: number[] | null }[]>(
    `SELECT embedding::real[] AS embedding FROM events WHERE id = $1`,
    eventId
  );

  const embedding = embeddingRow[0]?.embedding;
  if (!embedding || embedding.length === 0) {
    // Event mungkin belum di-publish atau embedding gagal
    if (event.status !== 'PUBLISHED') {
      return {
        recommendations: [],
        meta: {
          message: 'Publish the event first to enable sponsor recommendations.',
          threshold,
        },
      };
    }
    void embedEvent(eventId);
    return {
      recommendations: [],
      meta: {
        message: 'Event is being analyzed. Please try again in a few seconds.',
        threshold,
      },
    };
  }

  // Search similar companies
  const candidates = await searchSimilarCompanies(embedding, limit * 2, threshold);

  // Score & sort
  const scored = candidates
    .map((company) => scoreCompanyForEvent(company, event))
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, limit);

  return {
    recommendations: scored,
    meta: {
      total: scored.length,
      threshold,
      semanticWeight: 0.7,
    },
  };
};
