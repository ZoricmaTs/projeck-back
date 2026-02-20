import type { Request, Response, NextFunction } from "express";
import {z, type ZodSchema} from 'zod';

export const validate = (schema: ZodSchema, property: "body" | "params" | "query" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[property]);

    if (!result.success) {
      return res.status(400).json({
        errors: z.treeifyError(result.error),
      });
    }

    req[property] = result.data;

    next();
};
