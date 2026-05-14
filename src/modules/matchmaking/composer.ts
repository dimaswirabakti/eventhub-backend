import type { Event, CompanyProfile } from '@prisma/client';

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
  const parts = [
    `Perusahaan: ${company.companyName}`,
    `Industri: ${company.industry}`,
    `Deskripsi: ${company.description}`,
    company.targetAudience ? `Target audiens: ${company.targetAudience}` : '',
    `Lokasi: ${company.city}`,
  ].filter(Boolean);

  return parts.join('. ');
};
