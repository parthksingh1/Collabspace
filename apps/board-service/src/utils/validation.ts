import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from './errors.js';

export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      const errorMessage = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      next(new BadRequestError(`Validation failed: ${errorMessage}`));
      return;
    }

    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      const errorMessage = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      next(new BadRequestError(`Validation failed: ${errorMessage}`));
      return;
    }

    req.query = result.data;
    next();
  };
}
