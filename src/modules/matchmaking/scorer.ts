import type { EventSearchResult, CompanySearchResult } from './search.repository.js';
import type { Event, CompanyProfile } from '@prisma/client';
import { parsePreferences, type CompanyPreferences } from './preferences.types.js';

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

const categoryAlignment = (
  eventCategory: string,
  companyIndustry: string,
  preferences: CompanyPreferences | null
): number => {
  // Cek eksplisit preferredCategories kalau ada
  if (preferences && preferences.preferredCategories.length > 0) {
    return preferences.preferredCategories.includes(eventCategory as never) ? 1 : 0;
  }

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
  if (keywords.length === 0) return 0.3;

  const industry = companyIndustry.toLowerCase();
  const matched = keywords.some((kw) => industry.includes(kw));
  return matched ? 1 : 0;
};

const audienceFitness = (
  event: Pick<Event, 'audienceInterests' | 'audienceAgeMin' | 'audienceAgeMax'>,
  company: Pick<CompanyProfile, 'targetAudience'>,
  preferences: CompanyPreferences | null
): number => {
  let score = 0;
  let weightSum = 0;

  // Interests overlap (kalau ada di preferences)
  if (preferences && preferences.preferredInterests.length > 0) {
    const eventInterests = event.audienceInterests.map((i) => i.toLowerCase());
    const prefInterests = preferences.preferredInterests.map((i) => i.toLowerCase());
    const overlap = prefInterests.filter((i) =>
      eventInterests.some((ei) => ei.includes(i) || i.includes(ei))
    ).length;
    const interestScore = overlap / Math.max(prefInterests.length, 1);
    score += interestScore * 0.6;
    weightSum += 0.6;
  } else if (company.targetAudience) {
    // Fallback ke targetAudience text matching
    const audienceText = company.targetAudience.toLowerCase();
    const matched = event.audienceInterests.filter((i) =>
      audienceText.includes(i.toLowerCase())
    ).length;
    const fallbackScore = matched > 0 ? Math.min(matched / event.audienceInterests.length, 1) : 0.2;
    score += fallbackScore * 0.6;
    weightSum += 0.6;
  }

  // Age range overlap (kalau ada di preferences)
  if (
    preferences &&
    preferences.preferredAudienceAgeMin !== undefined &&
    preferences.preferredAudienceAgeMax !== undefined
  ) {
    const overlap = Math.max(
      0,
      Math.min(event.audienceAgeMax, preferences.preferredAudienceAgeMax) -
        Math.max(event.audienceAgeMin, preferences.preferredAudienceAgeMin)
    );
    const eventRange = event.audienceAgeMax - event.audienceAgeMin;
    const ageScore = eventRange > 0 ? overlap / eventRange : 0;
    score += ageScore * 0.4;
    weightSum += 0.4;
  }

  // Kalau tidak ada signal sama sekali, return neutral
  if (weightSum === 0) return 0.3;

  return score / weightSum;
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
  company: Pick<CompanyProfile, 'industry' | 'city' | 'targetAudience' | 'preferences'>
): ScoredEvent => {
  const preferences = parsePreferences(company.preferences);

  const semantic = event.similarity;
  const category = categoryAlignment(event.category, company.industry, preferences);
  const city = cityMatch(event.city, company.city);
  const audience = audienceFitness(
    {
      audienceInterests: event.audienceInterests,
      audienceAgeMin: event.audienceAgeMin,
      audienceAgeMax: event.audienceAgeMax,
    },
    { targetAudience: company.targetAudience },
    preferences
  );

  const finalScore =
    semantic * WEIGHTS.semantic +
    category * WEIGHTS.category +
    city * WEIGHTS.city +
    audience * WEIGHTS.audience;

  return {
    ...event,
    finalScore: Math.round(finalScore * 1000) / 1000,
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
  company: CompanySearchResult & { preferences?: unknown },
  event: Pick<
    Event,
    'category' | 'city' | 'audienceInterests' | 'audienceAgeMin' | 'audienceAgeMax'
  >
): ScoredCompany => {
  const preferences = parsePreferences(company.preferences);

  const semantic = company.similarity;
  const category = categoryAlignment(event.category, company.industry, preferences);
  const city = cityMatch(event.city, company.city);
  const audience = audienceFitness(
    {
      audienceInterests: event.audienceInterests,
      audienceAgeMin: event.audienceAgeMin,
      audienceAgeMax: event.audienceAgeMax,
    },
    { targetAudience: company.targetAudience },
    preferences
  );

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
