import { prisma } from '@/config/database.js';

// TYPES
export interface EventSearchResult {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  city: string;
  isOnline: boolean;
  bannerUrl: string | null;
  startDate: Date;
  endDate: Date;
  expectedAttendees: number;
  audienceAgeMin: number;
  audienceAgeMax: number;
  audienceInterests: string[];
  publishedAt: Date | null;
  eoOrganizationName: string;
  eoLogoUrl: string | null;
  eoCampus: string | null;
  similarity: number; // 0-1, hasil cosine similarity
}

export interface CompanySearchResult {
  id: string;
  userId: string;
  companyName: string;
  industry: string;
  description: string;
  logoUrl: string | null;
  city: string;
  targetAudience: string | null;
  similarity: number;
}

// HELPERS
const formatVector = (embedding: number[]): string => {
  return `[${embedding.join(',')}]`;
};

/**
 * SEARCH: Company FYP (For You Page)
 * Cari Events yang paling mirip dengan query embedding.
 * Filter: hanya event yang published, belum expired, dan punya embedding.
 */
export const searchSimilarEvents = async (
  queryEmbedding: number[],
  limit: number,
  threshold: number
): Promise<EventSearchResult[]> => {
  const vectorLiteral = formatVector(queryEmbedding);

  // pgvector operator <=> = cosine distance (1 - similarity)
  // Kita filter dengan distance <= (1 - threshold)
  const maxDistance = 1 - threshold;

  const results = await prisma.$queryRawUnsafe<EventSearchResult[]>(
    `
    SELECT 
      e.id,
      e.title,
      e.slug,
      e.description,
      e.category::text AS category,
      e.city,
      e."isOnline",
      e."bannerUrl",
      e."startDate",
      e."endDate",
      e."expectedAttendees",
      e."audienceAgeMin",
      e."audienceAgeMax",
      e."audienceInterests",
      e."publishedAt",
      eo."organizationName" AS "eoOrganizationName",
      eo."logoUrl" AS "eoLogoUrl",
      eo.campus AS "eoCampus",
      1 - (e.embedding <=> $1::vector) AS similarity
    FROM events e
    INNER JOIN eo_profiles eo ON eo.id = e."eoProfileId"
    WHERE e.status = 'PUBLISHED'
      AND e.embedding IS NOT NULL
      AND e."endDate" >= NOW()
      AND (e.embedding <=> $1::vector) <= $2
    ORDER BY e.embedding <=> $1::vector
    LIMIT $3
    `,
    vectorLiteral,
    maxDistance,
    limit
  );

  return results;
};

// SEARCH: EO mencari sponsor
export const searchSimilarCompanies = async (
  queryEmbedding: number[],
  limit: number,
  threshold: number
): Promise<CompanySearchResult[]> => {
  const vectorLiteral = formatVector(queryEmbedding);
  const maxDistance = 1 - threshold;

  const results = await prisma.$queryRawUnsafe<CompanySearchResult[]>(
    `
    SELECT 
      cp.id,
      cp."userId",
      cp."companyName",
      cp.industry,
      cp.description,
      cp."logoUrl",
      cp.city,
      cp."targetAudience",
      1 - (cp.embedding <=> $1::vector) AS similarity
    FROM company_profiles cp
    INNER JOIN users u ON u.id = cp."userId"
    WHERE u."isActive" = true
      AND cp.embedding IS NOT NULL
      AND (cp.embedding <=> $1::vector) <= $2
    ORDER BY cp.embedding <=> $1::vector
    LIMIT $3
    `,
    vectorLiteral,
    maxDistance,
    limit
  );

  return results;
};
