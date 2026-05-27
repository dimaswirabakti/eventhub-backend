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

  const prompt = `Anda adalah konsultan profesional yang membantu panitia event kampus di Indonesia menyusun proposal sponsorship yang menarik dan profesional, mengikuti struktur proposal sponsorship event kampus yang umum digunakan di Indonesia.

Buatlah proposal sponsorship dalam BAHASA INDONESIA berdasarkan data event berikut:

**Detail Event:**
- Nama: ${event.title}
- Penyelenggara: ${event.eoProfile.organizationName}${event.eoProfile.campus ? ` (${event.eoProfile.campus})` : ''}
- Tema: ${event.theme ?? 'Tidak spesifik'}
- Kategori: ${event.category}
- Tanggal: ${event.startDate.toLocaleDateString('id-ID')} - ${event.endDate.toLocaleDateString('id-ID')}
- Lokasi: ${event.isOnline ? 'Online' : `${event.venue ?? ''}, ${event.city}`}
- Deskripsi: ${event.description}

**Target Audiens:**
- Jumlah peserta diharapkan: ${event.expectedAttendees.toLocaleString('id-ID')} orang
- Rentang usia: ${event.audienceAgeMin}-${event.audienceAgeMax} tahun
- Minat: ${event.audienceInterests.join(', ')}

**Paket Sponsorship (Pilihan Kerjasama):**
${tiersContext || 'Belum ditentukan'}

${input.targetSponsorIndustry ? `**Target industri sponsor:** ${input.targetSponsorIndustry}` : ''}
${input.additionalContext ? `**Konteks tambahan:** ${input.additionalContext}` : ''}

**Tone yang diinginkan:** ${input.tone}

Susun proposal mengikuti struktur proposal sponsorship event kampus Indonesia, dengan bagian-bagian berikut:

1. **title** — Judul proposal sponsorship yang menarik (contoh format: "Proposal Sponsorship [Nama Event]")
2. **executiveSummary** — Ringkasan eksekutif 2-3 kalimat yang langsung menarik perhatian calon sponsor
3. **aboutOrganizer** — Profil singkat penyelenggara event (organisasi/kampus), bangun kredibilitas
4. **eventBackground** — Latar belakang dan urgensi penyelenggaraan event (1-2 paragraf)
5. **eventTheme** — Penjelasan tema besar event dan relevansinya
6. **objectives** — Tujuan penyelenggaraan event (3-5 poin)
7. **activities** — Rangkaian kegiatan atau susunan acara utama (3-7 poin, kembangkan secara masuk akal dari deskripsi event)
8. **targetAudience** — Penjelasan detail profil target audiens (1 paragraf)
9. **audienceReach** — Daya tarik event: jangkauan, skala peserta, demografi, dan potensi exposure untuk sponsor (1 paragraf dengan angka konkret)
10. **whySponsor** — Argumen persuasif mengapa sponsor harus terlibat di event ini (1 paragraf, fokus pada value untuk brand)
11. **sponsorshipPackages** — Untuk SETIAP paket sponsorship yang tersedia, buatkan objek dengan: tierName (nama paket), price (harga dalam format "Rp X.XXX.XXX"), dan benefits (daftar benefit konkret untuk paket itu). Gunakan data paket di atas. Kalau benefit kurang detail, kembangkan secara profesional dan masuk akal.
12. **generalBenefits** — Kontraprestasi/benefit umum yang didapat SEMUA sponsor terlepas dari paket (5-7 poin, misal: peliputan media sosial, sertifikat, exposure brand)
13. **closingStatement** — Pernyataan penutup yang meyakinkan dan profesional (1 paragraf)
14. **callToAction** — Ajakan konkret untuk sponsor mengambil langkah selanjutnya, sebutkan bahwa mereka dapat menghubungi penyelenggara untuk diskusi lebih lanjut

Gunakan bahasa yang ${input.tone === 'CASUAL' ? 'santai tapi tetap profesional' : input.tone === 'PERSUASIVE' ? 'sangat persuasif dengan emotional appeal yang kuat' : 'formal dan profesional'}. Pastikan setiap bagian terisi dengan konten yang spesifik dan relevan dengan data event, bukan placeholder generik.`;

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
            title: { type: Type.STRING },
            executiveSummary: { type: Type.STRING },
            aboutOrganizer: { type: Type.STRING },
            eventBackground: { type: Type.STRING },
            eventTheme: { type: Type.STRING },
            objectives: { type: Type.ARRAY, items: { type: Type.STRING } },
            activities: { type: Type.ARRAY, items: { type: Type.STRING } },
            targetAudience: { type: Type.STRING },
            audienceReach: { type: Type.STRING },
            whySponsor: { type: Type.STRING },
            sponsorshipPackages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  tierName: { type: Type.STRING },
                  price: { type: Type.STRING },
                  benefits: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['tierName', 'price', 'benefits'],
              },
            },
            generalBenefits: { type: Type.ARRAY, items: { type: Type.STRING } },
            closingStatement: { type: Type.STRING },
            callToAction: { type: Type.STRING },
          },
          required: [
            'title',
            'executiveSummary',
            'aboutOrganizer',
            'eventBackground',
            'eventTheme',
            'objectives',
            'activities',
            'targetAudience',
            'audienceReach',
            'whySponsor',
            'sponsorshipPackages',
            'generalBenefits',
            'closingStatement',
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
      config: {
        outputDimensionality: 768,
      },
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
