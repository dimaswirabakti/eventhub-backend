import { z } from 'zod';

// PROPOSAL BUILDER
export const generateProposalSchema = z.object({
  eventId: z.string().cuid(),
  tone: z.enum(['FORMAL', 'CASUAL', 'PERSUASIVE']).default('FORMAL'),
  targetSponsorIndustry: z.string().min(2).max(100).optional(),
  additionalContext: z.string().max(1000).optional(),
});

// SMART REVIEW
export const reviewProposalSchema = z.object({
  eventId: z.string().cuid(),
});

export type GenerateProposalInput = z.infer<typeof generateProposalSchema>;
export type ReviewProposalInput = z.infer<typeof reviewProposalSchema>;

// AI RESPONSE TYPES
export interface ProposalContent {
  title: string;
  executiveSummary: string;
  aboutOrganizer: string;
  eventBackground: string;
  eventTheme: string;
  objectives: string[];
  activities: string[];
  targetAudience: string;
  audienceReach: string;
  whySponsor: string;
  sponsorshipPackages: Array<{
    tierName: string;
    price: string;
    benefits: string[];
  }>;
  generalBenefits: string[];
  closingStatement: string;
  callToAction: string;
}

export interface ReviewResult {
  score: number; // 0-100
  strengths: string[];
  issues: ReviewIssue[];
  summary: string;
}

export interface ReviewIssue {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  category: 'BUDGET' | 'AUDIENCE' | 'CLARITY' | 'STRUCTURE' | 'COMPLETENESS';
  description: string;
  suggestion: string;
}
