import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '@/common/utils/async-handler.js';
import { UnauthorizedError } from '@/common/errors/app-error.js';
import * as savedEventsService from './saved-events.service.js';
import type { SavedEventsListQuery } from './saved-events.schema.js';

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

const getQuery = (res: Response): SavedEventsListQuery => {
  return res.locals.query as SavedEventsListQuery;
};

// POST /saved-events/:eventId —> Save (idempotent)
export const save = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const eventId = getParam(req, res, 'eventId');
  const result = await savedEventsService.saveEvent(req.user.id, eventId);
  res.status(StatusCodes.CREATED).json({ success: true, data: result });
});

// DELETE /saved-events/:eventId —> Unsave (idempotent)
export const unsave = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const eventId = getParam(req, res, 'eventId');
  const result = await savedEventsService.unsaveEvent(req.user.id, eventId);
  res.json({ success: true, data: result });
});

// GET /saved-events —> List
export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await savedEventsService.listSavedEvents(req.user.id, getQuery(res));
  res.json({ success: true, ...result });
});
