import { Request, Response, NextFunction } from 'express';
import { AppError, createErrorResponse } from '../utils/errors';

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    // Only log non-5xx errors in development
    if (err.statusCode < 500 && process.env.NODE_ENV !== 'production') {
      console.error(`[ErrorHandler] ${err.statusCode} - ${err.message}`);
    }
    res.status(err.statusCode).json(createErrorResponse(err));
  } else {
    // Always log unhandled errors, but with less detail in production
    if (process.env.NODE_ENV === 'production') {
      console.error('Unhandled error occurred');
    } else {
      console.error('Unhandled error:', err);
    }
    res.status(500).json(
      createErrorResponse(
        new AppError('INTERNAL_ERROR', 'An unexpected error occurred', 500)
      )
    );
  }
}

