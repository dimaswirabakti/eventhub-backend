import type { EventSearchResult, CompanySearchResult } from './search.repository.js';
import type { Event, CompanyProfile } from '@prisma/client';

// CONFIG
const WEIGHTS = {
  semantic: 0.7,
  category: 0.15,
  city: 0.1,
  audience: 0.05,
} as const;

/**
 * HELPERS.
 * Hitung intersection ratio dari dua string array.
 * Returns 0 - 1. 0 = no overlap, 1 = fully overlapped.
 */
// const arrayOverlap = (a: string[], b: string[]): number => {
//   if (a.length === 0 || b.length === 0) return 0;
//   const setA = new Set(a.map((s) => s.toLowerCase()));
//   const overlap = b.filter((s) => setA.has(s.toLowerCase())).length;
//   return overlap / Math.max(a.length, b.length);
// };

const cityMatch = (cityA: string, cityB: string): number => {
  return cityA.toLowerCase() === cityB.toLowerCase() ? 1 : 0;
};

const categoryAlignment = (eventCategory: string, companyIndustry: string): number => {
  // Mapping kategori event yang relevant ke industri company
  // Ini prosedur sederhana, bisa ditambahkan nanti
  const mapping: Record<string, string[]> = {
    TECHNOLOGY: ['technology', 'software', 'tech', 'it', 'digital', 'startup', 'fintech'],
    BUSINESS: ['finance', 'banking', 'consulting', 'business', 'investment'],
    ARTS: ['media', 'entertainment', 'design', 'creative', 'advertising'],
    SPORTS: ['sports', 'fitness', 'apparel', 'beverage', 'health'],
    EDUCATION: ['education', 'edutech', 'publishing', 'training'],
    SOCIAL: ['nonprofit', 'community', 'social', 'csr'],
    ENTERTAINMENT: ['entertainment', 'media', 'fnb', 'lifestyle'],
    COMPETITION: ['technology', 'sports', 'gaming', 'startup'],
    CONFERENCE: ['business', 'technology', 'consulting'],
    WORKSHOP: ['education', 'technology', 'business'],
    OTHER: [],
  };

  const keywords = mapping[eventCategory.toUpperCase()] ?? [];
  if (keywords.length === 0) return 0.3; // neutral score

  const industry = companyIndustry.toLowerCase();
  const matched = keywords.some((kw) => industry.includes(kw));
  return matched ? 1 : 0;
};

const audienceFitness = (
  eventInterests: string[],
  companyTargetAudience: string | null
): number => {
  if (!companyTargetAudience) return 0.3; // neutral
  const audienceText = companyTargetAudience.toLowerCase();
  const matched = eventInterests.filter((i) => audienceText.includes(i.toLowerCase())).length;
  return matched > 0 ? Math.min(matched / eventInterests.length, 1) : 0.2;
};

// SCORING: Event for Company (FYP - "For You Page")
export interface ScoredEvent extends EventSearchResult {
  finalScore: number;
  scoreBreakdown: {
    semantic: number;
    category: number;
    city: number;
    audience: number;
  };
}

// Hitung final score untuk Event dari sudut pandang Company.
export const scoreEventForCompany = (
  event: EventSearchResult,
  company: Pick<CompanyProfile, 'industry' | 'city' | 'targetAudience'>
): ScoredEvent => {
  const semantic = event.similarity;
  const category = categoryAlignment(event.category, company.industry);
  const city = cityMatch(event.city, company.city);
  const audience = audienceFitness(event.audienceInterests, company.targetAudience);

  const finalScore =
    semantic * WEIGHTS.semantic +
    category * WEIGHTS.category +
    city * WEIGHTS.city +
    audience * WEIGHTS.audience;

  return {
    ...event,
    finalScore: Math.round(finalScore * 1000) / 1000, // 3 decimal
    scoreBreakdown: {
      semantic: Math.round(semantic * 1000) / 1000,
      category,
      city,
      audience: Math.round(audience * 1000) / 1000,
    },
  };
};

// SCORING: Company for Event
export interface ScoredCompany extends CompanySearchResult {
  finalScore: number;
  scoreBreakdown: {
    semantic: number;
    category: number;
    city: number;
    audience: number;
  };
}

export const scoreCompanyForEvent = (
  company: CompanySearchResult,
  event: Pick<Event, 'category' | 'city' | 'audienceInterests'>
): ScoredCompany => {
  const semantic = company.similarity;
  const category = categoryAlignment(event.category, company.industry);
  const city = cityMatch(event.city, company.city);
  const audience = audienceFitness(event.audienceInterests, company.targetAudience);

  const finalScore =
    semantic * WEIGHTS.semantic +
    category * WEIGHTS.category +
    city * WEIGHTS.city +
    audience * WEIGHTS.audience;

  return {
    ...company,
    finalScore: Math.round(finalScore * 1000) / 1000,
    scoreBreakdown: {
      semantic: Math.round(semantic * 1000) / 1000,
      category,
      city,
      audience: Math.round(audience * 1000) / 1000,
    },
  };
};
