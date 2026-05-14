import { firebaseBucket } from '@/config/firebase.js';
import { env } from '@/config/env.js';
import { logger } from '@/config/logger.js';

// Cek apakah URL valid dari Firebase Storage bucket app ini
export const isValidFirebaseStorageUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    const isFirebaseHost =
      parsed.hostname === 'firebasestorage.googleapis.com' ||
      parsed.hostname.endsWith('.firebasestorage.app') ||
      parsed.hostname.endsWith('.appspot.com');

    if (!isFirebaseHost) return false;

    // Cek bucket name di path/hostname
    const expectedBucket = env.FIREBASE_STORAGE_BUCKET;
    return url.includes(expectedBucket);
  } catch {
    return false;
  }
};

/**
 * Extract file path dari Firebase Storage download URL.
 * Contoh: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/events%2Fbanners%2Fabc.jpg?alt=media&token=...
 *        -> menjadi events/banners/abc.jpg
 */
export const extractStoragePath = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    // URL format: /v0/b/<bucket>/o/<encoded-path>
    const match = parsed.pathname.match(/\/o\/(.+)$/);
    if (!match || !match[1]) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

// Hapus file dari Firebase Storage.
export const deleteStorageFile = async (urlOrPath: string): Promise<boolean> => {
  try {
    const path = urlOrPath.startsWith('http') ? extractStoragePath(urlOrPath) : urlOrPath;

    if (!path) {
      logger.warn({ urlOrPath }, 'Invalid storage URL/path');
      return false;
    }

    const file = firebaseBucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      logger.debug({ path }, 'File does not exist, skipping delete');
      return true;
    }

    await file.delete();
    return true;
  } catch (err) {
    logger.error({ err, urlOrPath }, 'Failed to delete storage file');
    return false;
  }
};

// Cek apakah file exists di Firebase Storage.
export const fileExists = async (urlOrPath: string): Promise<boolean> => {
  try {
    const path = urlOrPath.startsWith('http') ? extractStoragePath(urlOrPath) : urlOrPath;

    if (!path) return false;

    const [exists] = await firebaseBucket.file(path).exists();
    return exists;
  } catch {
    return false;
  }
};
