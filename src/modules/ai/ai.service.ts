import { genAI, GEMINI_MODELS } from '@/config/gemini.js';
import { prisma } from '@/config/database.js';
import { logger } from '@/config/logger.js';
import { AppError, NotFoundError, ForbiddenError } from '@/common/errors/app-error.js';
import { StatusCodes } from 'http-status-codes';
import { deductToken } from '@/modules/billing/billing.service.js';
import type {
  GenerateProposalInput,
  ProposalContent,
  ReviewProposalInput,
  ReviewResult,
} from './ai.schema.js';
import { Type } from '@google/genai';
import { Prisma } from '@prisma/client';

// HELPER: Get Event with Ownership Check
const getOwnedEvent = async (userId: string, eventId: string) => {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      eoProfile: { select: { userId: true, organizationName: true, campus: true } },
      tiers: true,
      proposal: true,
    },
  });
  if (!event) throw new NotFoundError('Event');
  if (event.eoProfile.userId !== userId) {
    throw new ForbiddenError('You do not own this event');
  }
  return event;
};

// PROPOSAL BUILDER
export const generateProposal = async (userId: string, input: GenerateProposalInput) => {
  const event = await getOwnedEvent(userId, input.eventId);

  // Build prompt context dari data event
  const tiersContext = event.tiers
    .map((t) => `- ${t.name}: Rp ${t.price.toLocaleString('id-ID')} (${t.benefits.join(', ')})`)
    .join('\n');

  const prompt = `Anda adalah konsultan profesional yang membantu mahasiswa Indonesia membuat proposal sponsorship event.

Buatlah proposal sponsorship dalam BAHASA INDONESIA yang profesional dan persuasif berdasarkan data event berikut:

**Detail Event:**
- Nama: ${event.title}
- Organisasi: ${event.eoProfile.organizationName}${event.eoProfile.campus ? ` (${event.eoProfile.campus})` : ''}
- Tema: ${event.theme ?? 'Tidak spesifik'}
- Kategori: ${event.category}
- Tanggal: ${event.startDate.toLocaleDateString('id-ID')} - ${event.endDate.toLocaleDateString('id-ID')}
- Lokasi: ${event.isOnline ? 'Online' : `${event.venue ?? ''}, ${event.city}`}
- Deskripsi: ${event.description}

**Target Audiens:**
- Jumlah peserta diharapkan: ${event.expectedAttendees.toLocaleString('id-ID')} orang
- Rentang usia: ${event.audienceAgeMin}-${event.audienceAgeMax} tahun
- Minat: ${event.audienceInterests.join(', ')}

**Paket Sponsorship:**
${tiersContext || 'Belum ditentukan'}

${input.targetSponsorIndustry ? `**Target industri sponsor:** ${input.targetSponsorIndustry}` : ''}
${input.additionalContext ? `**Konteks tambahan:** ${input.additionalContext}` : ''}

**Tone yang diinginkan:** ${input.tone}

Buatlah proposal dengan struktur:
1. Executive Summary (2-3 kalimat menarik)
2. Latar belakang event
3. Tujuan event (3-5 poin)
4. Penjelasan target audiens (1 paragraf)
5. Mengapa sponsor harus terlibat di event ini (1 paragraf persuasif)
6. Benefit untuk sponsor (5-7 poin konkret)
7. Call to action (1 paragraf penutup yang mendorong sponsor untuk action)

Gunakan bahasa yang ${input.tone === 'CASUAL' ? 'santai tapi tetap profesional' : input.tone === 'PERSUASIVE' ? 'sangat persuasif dengan emotional appeal' : 'formal dan profesional'}.`;

  // Call Gemini dengan structured output
  let aiResult: ProposalContent;
  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODELS.text,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: { type: Type.STRING },
            eventBackground: { type: Type.STRING },
            objectives: { type: Type.ARRAY, items: { type: Type.STRING } },
            targetAudience: { type: Type.STRING },
            whyThisEvent: { type: Type.STRING },
            sponsorshipBenefits: { type: Type.ARRAY, items: { type: Type.STRING } },
            callToAction: { type: Type.STRING },
          },
          required: [
            'executiveSummary',
            'eventBackground',
            'objectives',
            'targetAudience',
            'whyThisEvent',
            'sponsorshipBenefits',
            'callToAction',
          ],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty response from Gemini');
    aiResult = JSON.parse(text) as ProposalContent;
  } catch (err) {
    logger.error({ err, eventId: input.eventId }, 'Gemini generateProposal failed');
    throw new AppError(
      'AI service is currently unavailable. Please try again.',
      StatusCodes.BAD_GATEWAY
    );
  }

  // Save ke DB + deduct token dalam transaction atomic
  const result = await prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.upsert({
      where: { eventId: event.id },
      create: {
        eventId: event.id,
        source: 'GENERATED',
        content: JSON.stringify(aiResult),
      },
      update: {
        source: 'GENERATED',
        content: JSON.stringify(aiResult),
        aiScore: null,
        aiFeedback: Prisma.JsonNull,
      },
    });

    await deductToken(userId, 'PROPOSAL_BUILDER', { referenceId: event.id }, tx);

    return proposal;
  });

  return {
    proposal: result,
    content: aiResult,
  };
};

// SMART REVIEW
export const reviewProposal = async (userId: string, input: ReviewProposalInput) => {
  const event = await getOwnedEvent(userId, input.eventId);

  if (!event.proposal) {
    throw new AppError(
      'No proposal found for this event. Create or upload one first.',
      StatusCodes.BAD_REQUEST
    );
  }

  // Build context: gabung data event + isi proposal
  const proposalText = event.proposal.content
    ? event.proposal.content
    : event.proposal.fileUrl
      ? `[Proposal file: ${event.proposal.fileUrl}] (Note: review based on event metadata only)`
      : '';

  const tiersContext = event.tiers
    .map((t) => `- ${t.name}: Rp ${t.price.toLocaleString('id-ID')}`)
    .join('\n');

  const prompt = `Anda adalah evaluator profesional untuk proposal sponsorship event mahasiswa di Indonesia.

Berikut adalah proposal yang perlu dianalisis:

**Data Event:**
- Nama: ${event.title}
- Kategori: ${event.category}
- Peserta diharapkan: ${event.expectedAttendees}
- Target audiens: ${event.audienceAgeMin}-${event.audienceAgeMax} tahun, minat: ${event.audienceInterests.join(', ')}

**Paket Sponsorship:**
${tiersContext}

**Isi Proposal:**
${proposalText}

Evaluasi proposal ini secara objektif dengan kriteria:
1. **BUDGET** — Apakah harga tier wajar untuk skala event?
2. **AUDIENCE** — Apakah target audiens jelas dan menarik untuk sponsor?
3. **CLARITY** — Apakah penjelasan event mudah dipahami?
4. **STRUCTURE** — Apakah struktur proposal lengkap dan logis?
5. **COMPLETENESS** — Apakah ada informasi penting yang hilang?

Berikan:
- Skor 0-100 (objektif, jangan terlalu lunak)
- 2-5 kekuatan utama
- 3-7 issues dengan severity (CRITICAL=major problem, WARNING=harus diperbaiki, INFO=saran improvement)
- Setiap issue harus punya kategori dan saran konkret
- Summary 1-2 kalimat menutup`;

  let aiResult: ReviewResult;
  try {
    const response = await genAI.models.generateContent({
      model: GEMINI_MODELS.text,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            issues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  severity: { type: Type.STRING, enum: ['CRITICAL', 'WARNING', 'INFO'] },
                  category: {
                    type: Type.STRING,
                    enum: ['BUDGET', 'AUDIENCE', 'CLARITY', 'STRUCTURE', 'COMPLETENESS'],
                  },
                  description: { type: Type.STRING },
                  suggestion: { type: Type.STRING },
                },
                required: ['severity', 'category', 'description', 'suggestion'],
              },
            },
            summary: { type: Type.STRING },
          },
          required: ['score', 'strengths', 'issues', 'summary'],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error('Empty response from Gemini');
    aiResult = JSON.parse(text) as ReviewResult;
  } catch (err) {
    logger.error({ err, eventId: input.eventId }, 'Gemini reviewProposal failed');
    throw new AppError(
      'AI service is currently unavailable. Please try again.',
      StatusCodes.BAD_GATEWAY
    );
  }

  // Validate score range
  const score = Math.max(0, Math.min(100, Math.round(aiResult.score)));

  // Save ke DB + deduct token
  const result = await prisma.$transaction(async (tx) => {
    const proposal = await tx.proposal.update({
      where: { eventId: event.id },
      data: {
        aiScore: score,
        aiFeedback: aiResult as unknown as Prisma.InputJsonValue,
      },
    });

    await deductToken(userId, 'SMART_REVIEW', { referenceId: event.id }, tx);

    return proposal;
  });

  return {
    proposal: result,
    review: { ...aiResult, score },
  };
};

// EMBEDDING SERVICE (untuk Matchmaking)
/**
 * Generate vector embedding 768-dim untuk text.
 * Dipakai internal, bukan endpoint publik.
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const response = await genAI.models.embedContent({
      model: GEMINI_MODELS.embedding,
      contents: text,
    });

    const embedding = response.embeddings?.[0]?.values;
    if (!embedding || embedding.length === 0) {
      throw new Error('Empty embedding from Gemini');
    }
    return embedding;
  } catch (err) {
    logger.error({ err, textLength: text.length }, 'Gemini generateEmbedding failed');
    throw new AppError('Embedding service unavailable', StatusCodes.BAD_GATEWAY);
  }
};
