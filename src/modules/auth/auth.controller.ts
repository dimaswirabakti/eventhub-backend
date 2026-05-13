import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { asyncHandler } from '@/common/utils/async-handler.js';
import * as authService from './auth.service.js';
import type { RegisterInput } from './auth.schema.js';
import { UnauthorizedError } from '@/common/errors/app-error.js';

export const register = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();

  const { firebaseUid, email } = req.user;
  const input = req.body as RegisterInput;

  const user = await authService.registerUser(firebaseUid, email, input);

  res.status(StatusCodes.CREATED).json({
    success: true,
    message: 'User registered successfully',
    data: user,
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();

  const user = await authService.syncUser(req.user.firebaseUid);

  res.json({
    success: true,
    message: 'Logged in successfully',
    data: user,
  });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();

  const user = await authService.getUserWithProfile(req.user.id);

  res.json({
    success: true,
    data: user,
  });
});

export const deleteMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new UnauthorizedError();

  await authService.deactivateUser(req.user.id);

  res.json({
    success: true,
    message: 'Account deactivated successfully',
  });
});
