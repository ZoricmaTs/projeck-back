import jwt from "jsonwebtoken";
import type {Request, Response, NextFunction} from 'express';
import {ApiError} from '../errors/api-error.js';

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;

  if (!header) {
    throw ApiError.Unauthorized("Authorization token is invalid");
  }

  const token = header.split(" ")[1]!;

  try {
    jwt.verify(
      token,
      process.env.JWT_SECRET!
    );

    next();
  } catch {
    throw ApiError.Unauthorized("Authorization token is invalid");
  }
}