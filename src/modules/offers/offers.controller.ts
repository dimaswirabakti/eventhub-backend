import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '@/common/utils/async-handler.js';
import { UnauthorizedError } from '@/common/errors/app-error.js';
import * as offerService from './offers.service.js';
import type { CreateOfferInput, OfferListQuery, RejectOfferInput } from './offers.schema.js';

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

// COMPANY ENDPOINTS
export const createOffer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const offer = await offerService.createOffer(req.user.id, req.body as CreateOfferInput);
  res.status(StatusCodes.CREATED).json({ success: true, data: offer });
});

export const listMyOffers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await offerService.listMyOffers(req.user.id, getQuery(res));
  res.json({ success: true, ...result });
});

export const getMyOffer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const offer = await offerService.getOfferByIdForCompany(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: offer });
});

export const cancelOffer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const offer = await offerService.cancelOffer(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: offer });
});

// EO ENDPOINTS (incoming Company offers)
export const listIncomingOffers = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await offerService.listIncomingOffers(req.user.id, getQuery(res));
  res.json({ success: true, ...result });
});

export const getIncomingOffer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const offer = await offerService.getIncomingOffer(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: offer });
});

export const acceptOffer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const offer = await offerService.acceptOffer(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: offer });
});

export const rejectOffer = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const offer = await offerService.rejectOffer(
    req.user.id,
    getParam(req, res, 'id'),
    req.body as RejectOfferInput
  );
  res.json({ success: true, data: offer });
});
