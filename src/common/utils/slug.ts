/**
 * Convert string ke slug URL-friendly.
 * "BEM FT UGM Festival 2026!" -> "bem-ft-ugm-festival-2026"
 */
export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s-]/g, '') // remove special chars
    .trim()
    .replace(/\s+/g, '-') // spaces to dashes
    .replace(/-+/g, '-'); // collapse multiple dashes
};

// Generate slug unik dengan suffix random 6 karakter.
export const generateUniqueSlug = (text: string): string => {
  const base = slugify(text);
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
};
