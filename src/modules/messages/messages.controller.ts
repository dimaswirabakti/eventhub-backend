import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '@/common/utils/async-handler.js';
import { UnauthorizedError } from '@/common/errors/app-error.js';
import * as messageService from './messages.service.js';
import type { MessageListQuery, SendMessageInput } from './messages.schema.js';

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

const getQuery = (res: Response): MessageListQuery => {
  return res.locals.query as MessageListQuery;
};

export const send = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const { content } = req.body as SendMessageInput;
  const message = await messageService.sendMessage(
    req.user.id,
    getParam(req, res, 'offerId'),
    content
  );
  res.status(StatusCodes.CREATED).json({ success: true, data: message });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();
  const result = await messageService.listMessages(
    req.user.id,
    getParam(req, res, 'offerId'),
    getQuery(res)
  );
  res.json({ success: true, ...result });
});
