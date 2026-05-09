import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { AppError } from '@/common/errors/app-error.js';
import { logger } from '@/config/logger.js';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  // Zod validation error
  if (err instanceof ZodError) {
    res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: 'Validation error',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  // Known operational error
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
    return;
  }

  // Unknown error — log dan return 500
  logger.error({ err }, 'Unhandled error');
  res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: 'Internal server error',
  });
};

export const notFoundHandler: ErrorRequestHandler = (req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
};
