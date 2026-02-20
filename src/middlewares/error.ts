import type { Request, Response, NextFunction } from "express";
import { ApiError } from "../errors/api-error.js";

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(err);

  if (err instanceof ApiError) {
    return res.status(err.status).json({ message: err.message });
  }

  return res.status(500).json({ message: "Internal Server Error" });
};