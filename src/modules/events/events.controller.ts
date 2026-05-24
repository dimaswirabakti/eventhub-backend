import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '@/common/utils/async-handler.js';
import { UnauthorizedError } from '@/common/errors/app-error.js';
import * as eventService from './events.service.js';
import type {
  CatalogFilter,
  CreateEventInput,
  CreateTierInput,
  SetProposalInput,
  UpdateEventInput,
  UpdateTierInput,
  UpdateProposalContentInput,
} from './events.schema.js';

// Helper: get param yang sudah divalidasi (dari res.locals) atau fallback ke req.params
const getParam = (req: Request, res: Response, key: string): string => {
  const validated = res.locals.params as Record<string, unknown> | undefined;
  if (validated && typeof validated[key] === 'string') {
    return validated[key];
  }
  // Fallback (kalau route tidak pakai validate(...,'params'))
  const raw = req.params[key];
  if (typeof raw !== 'string') {
    throw new Error(`Param "${key}" missing or invalid`);
  }
  return raw;
};

// EVENT CRUD
export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const event = await eventService.createEvent(req.user.id, req.body as CreateEventInput);
  res.status(StatusCodes.CREATED).json({ success: true, data: event });
});

export const listMine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const events = await eventService.listMyEvents(req.user.id);
  res.json({ success: true, data: events });
});

export const getMine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const event = await eventService.getMyEvent(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: event });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const event = await eventService.updateEvent(
    req.user.id,
    getParam(req, res, 'id'),
    req.body as UpdateEventInput
  );
  res.json({ success: true, data: event });
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await eventService.deleteEvent(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: result });
});

export const publish = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const event = await eventService.publishEvent(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: event });
});

export const close = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const event = await eventService.closeEvent(req.user.id, getParam(req, res, 'id'));
  res.json({ success: true, data: event });
});

// TIER MANAGEMENT
export const createTier = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const tier = await eventService.createTier(
    req.user.id,
    getParam(req, res, 'id'),
    req.body as CreateTierInput
  );
  res.status(StatusCodes.CREATED).json({ success: true, data: tier });
});

export const updateTier = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const tier = await eventService.updateTier(
    req.user.id,
    getParam(req, res, 'id'),
    getParam(req, res, 'tierId'),
    req.body as UpdateTierInput
  );
  res.json({ success: true, data: tier });
});

export const deleteTier = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await eventService.deleteTier(
    req.user.id,
    getParam(req, res, 'id'),
    getParam(req, res, 'tierId')
  );
  res.json({ success: true, data: result });
});

// PROPOSAL
export const setProposal = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const proposal = await eventService.setProposal(
    req.user.id,
    getParam(req, res, 'id'),
    req.body as SetProposalInput
  );
  res.json({ success: true, data: proposal });
});

// UPDATE AI-GENERATED PROPOSAL
export const updateProposalContent = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { content } = req.body as UpdateProposalContentInput;
  const proposal = await eventService.updateProposalContent(
    req.user.id,
    getParam(req, res, 'id'),
    content
  );
  res.json({ success: true, data: proposal });
});

// PUBLIC CATALOG
export const catalog = asyncHandler(async (req: Request, res: Response) => {
  // Ambil filter dari res.locals.query (sudah divalidasi & defaults Zod applied)
  const filter = res.locals.query as CatalogFilter;
  const result = await eventService.listPublicCatalog(filter);
  res.json({ success: true, ...result });
});

export const publicDetail = asyncHandler(async (req: Request, res: Response) => {
  const event = await eventService.getPublicEventBySlug(getParam(req, res, 'slug'));
  res.json({ success: true, data: event });
});

export const deleteBanner = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const event = await eventService.deleteEventBanner(req.user.id, req.params.id! as string);
  res.json({ success: true, data: event });
});
