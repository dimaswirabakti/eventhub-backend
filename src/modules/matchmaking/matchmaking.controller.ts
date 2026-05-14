import type { Request, Response } from 'express';
import { asyncHandler } from '@/common/utils/async-handler.js';
import { UnauthorizedError } from '@/common/errors/app-error.js';
import * as matchmakingService from './matchmaking.service.js';
import type { RecommendationQuery } from './matchmaking.schema.js';

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

const getQuery = (res: Response): RecommendationQuery => {
  return res.locals.query as RecommendationQuery;
};

// GET /recommendations/events — untuk Company FYP
export const eventsForMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const query = getQuery(res);
  const result = await matchmakingService.recommendEventsForCompany(req.user.id, {
    limit: query.limit,
    threshold: query.threshold,
  });
  res.json({ success: true, ...result });
});

// GET /recommendations/sponsors/:eventId — untuk EO cari sponsor
export const sponsorsForEvent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const eventId = getParam(req, res, 'eventId');
  const query = getQuery(res);
  const result = await matchmakingService.recommendSponsorsForEvent(req.user.id, eventId, {
    limit: query.limit,
    threshold: query.threshold,
  });
  res.json({ success: true, ...result });
});