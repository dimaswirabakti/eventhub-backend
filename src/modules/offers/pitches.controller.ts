import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '@/common/utils/async-handler.js';
import { UnauthorizedError } from '@/common/errors/app-error.js';
import * as pitchService from './pitches.service.js';
import type { CreatePitchInput, OfferListQuery, RejectOfferInput } from './offers.schema.js';

const getParam = (req: Request, res: Response, key: string): string => {
  const validated = res.locals.params as Record<string, unknown> | undefined;
  if (validated && typeof validated[key] === 'string') {
    return validated[key];
  }
  const raw = req.params[key];
  if (typeof raw !== 'string') {
    throw new Error(`Param "${key}" missing or invalid`);
  }
  return raw;
};

const getQuery = (res: Response): OfferListQuery => {
  return res.locals.query as OfferListQuery;
};

// EO ENDPOINTS
export const createPitch = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const pitch = await pitchService.createPitch(req.user.id, req.body as CreatePitchInput);
  res.status(StatusCodes.CREATED).json({ success: true, data: pitch });
});

export const listMyPitches = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await pitchService.listMyPitches(req.user.id, getQuery(res));
  res.json({ success: true, ...result });
});

export const getMyPitch = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const pitch = await pitchService.getPitchByIdForEo(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: pitch });
});

export const cancelPitch = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const pitch = await pitchService.cancelPitch(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: pitch });
});

// COMPANY ENDPOINTS (incoming EO pitches)
export const listIncomingPitches = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await pitchService.listIncomingPitches(req.user.id, getQuery(res));
  res.json({ success: true, ...result });
});

export const getIncomingPitch = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const pitch = await pitchService.getIncomingPitch(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: pitch });
});

export const acceptPitch = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const pitch = await pitchService.acceptPitch(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: pitch });
});

export const rejectPitch = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const pitch = await pitchService.rejectPitch(
    req.user.id,
    getParam(req, res, 'id'),
    req.body as RejectOfferInput
  );
  res.json({ success: true, data: pitch });
});
