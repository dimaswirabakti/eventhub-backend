import type { Request, Response } from 'express';
import { asyncHandler } from '@/common/utils/async-handler.js';
import { UnauthorizedError } from '@/common/errors/app-error.js';
import * as aiService from './ai.service.js';
import type { GenerateProposalInput, ReviewProposalInput } from './ai.schema.js';

export const generateProposal = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await aiService.generateProposal(req.user.id, req.body as GenerateProposalInput);
  res.json({ success: true, data: result });
});

export const reviewProposal = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await aiService.reviewProposal(req.user.id, req.body as ReviewProposalInput);
  res.json({ success: true, data: result });
});
