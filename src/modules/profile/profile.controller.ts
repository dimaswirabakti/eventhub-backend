import type { Request, Response } from 'express';
import { asyncHandler } from '@/common/utils/async-handler.js';
import { UnauthorizedError } from '@/common/errors/app-error.js';
import * as profileService from './profile.service.js';
import type { UpdateCompanyProfileInput, UpdateEoProfileInput } from './profile.schema.js';

export const updateEo = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const user = await profileService.updateEoProfile(req.user.id, req.body as UpdateEoProfileInput);
  res.json({ success: true, data: user });
});

export const updateCompany = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const user = await profileService.updateCompanyProfile(
    req.user.id,
    req.body as UpdateCompanyProfileInput
  );
  res.json({ success: true, data: user });
});

export const getCompanyPreferences = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const preferences = await profileService.getCompanyPreferences(req.user.id);
  res.json({ success: true, data: preferences });
});
