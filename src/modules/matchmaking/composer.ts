import type { Event, CompanyProfile } from '@prisma/client';
import { parsePreferences } from './preferences.types.js';

// Compose text representation dari Event untuk di-embed.
export const composeEventText = (event: Event): string => {
  const parts = [
    `Event: ${event.title}`,
    `Kategori: ${event.category}`,
    event.theme ? `Tema: ${event.theme}` : '',
    `Deskripsi: ${event.description}`,
    `Target audiens: usia ${event.audienceAgeMin}-${event.audienceAgeMax} tahun`,
    `Minat audiens: ${event.audienceInterests.join(', ')}`,
    `Skala: ${event.expectedAttendees} peserta`,
    event.isOnline ? 'Format: online' : `Lokasi: ${event.city}`,
  ].filter(Boolean);

  return parts.join('. ');
};

// Compose text representation dari CompanyProfile untuk di-embed.
export const composeCompanyText = (company: CompanyProfile): string => {
  const parts: string[] = [
    `Perusahaan: ${company.companyName}`,
    `Industri: ${company.industry}`,
    `Deskripsi: ${company.description}`,
    company.targetAudience ? `Target audiens: ${company.targetAudience}` : '',
    `Lokasi: ${company.city}`,
  ];

  // Tambahkan preferences kalau ada
  const prefs = parsePreferences(company.preferences);
  if (prefs) {
    if (prefs.preferredCategories.length > 0) {
      parts.push(`Mencari event di kategori: ${prefs.preferredCategories.join(', ')}`);
    }

    if (
      prefs.preferredAudienceAgeMin !== undefined &&
      prefs.preferredAudienceAgeMax !== undefined
    ) {
      parts.push(
        `Target audiens yang dicari: usia ${prefs.preferredAudienceAgeMin}-${prefs.preferredAudienceAgeMax} tahun`
      );
    }

    if (prefs.preferredInterests.length > 0) {
      parts.push(`Minat audiens yang dicari: ${prefs.preferredInterests.join(', ')}`);
    }
  }

  return parts.filter(Boolean).join('. ');
};
