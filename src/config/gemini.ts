import { GoogleGenAI } from '@google/genai';
import { env } from './env.js';

export const genAI = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

export const GEMINI_MODELS = {
  text: env.GEMINI_MODEL,
  embedding: env.GEMINI_EMBEDDING_MODEL,
} as const;
