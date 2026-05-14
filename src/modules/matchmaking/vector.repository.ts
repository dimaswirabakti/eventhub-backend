import { prisma } from '@/config/database.js';
import { logger } from '@/config/logger.js';

/**
 * Format vector array jadi PostgreSQL vector literal.
 * pgvector accept format: '[0.1,0.2,0.3,...]'
 */
const formatVector = (embedding: number[]): string => {
  return `[${embedding.join(',')}]`;
};

/**
 * EVENT EMBEDDINGS
 * Save embedding ke kolom Event.embedding.
 * Pakai raw SQL karena Prisma belum support tipe vector.
 */
export const saveEventEmbedding = async (eventId: string, embedding: number[]): Promise<void> => {
  const vectorLiteral = formatVector(embedding);

  const rowsAffected = await prisma.$executeRawUnsafe(
    `UPDATE events SET embedding = $1::vector, "updatedAt" = NOW() WHERE id = $2`,
    vectorLiteral,
    eventId
  );

  if (rowsAffected === 0) {
    logger.warn({ eventId }, 'No event updated when saving embedding');
  }
};

/**
 * Clear embedding dari Event (set NULL).
 * Dipakai kalau event diunpublish atau dihapus.
 */
export const clearEventEmbedding = async (eventId: string): Promise<void> => {
  await prisma.$executeRawUnsafe(`UPDATE events SET embedding = NULL WHERE id = $1`, eventId);
};

// COMPANY PROFILE EMBEDDINGS
export const saveCompanyEmbedding = async (
  companyProfileId: string,
  embedding: number[]
): Promise<void> => {
  const vectorLiteral = formatVector(embedding);

  const rowsAffected = await prisma.$executeRawUnsafe(
    `UPDATE company_profiles SET embedding = $1::vector, "updatedAt" = NOW() WHERE id = $2`,
    vectorLiteral,
    companyProfileId
  );

  if (rowsAffected === 0) {
    logger.warn({ companyProfileId }, 'No company updated when saving embedding');
  }
};

export const clearCompanyEmbedding = async (companyProfileId: string): Promise<void> => {
  await prisma.$executeRawUnsafe(
    `UPDATE company_profiles SET embedding = NULL WHERE id = $1`,
    companyProfileId
  );
};
