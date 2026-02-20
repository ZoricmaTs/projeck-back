import type { Request, Response } from "express";
import { userService } from "../services/user.ts";
import { ApiError } from "../errors/api-error.ts";
import { prisma } from "../lib/prisma.ts";
import {buildUserQuery, type UserQueryParams} from '../utils/query-builder.js';

type DeleteUserParams = {
  id: string;
};

export const userController = {
  async getUsers(req: { query: UserQueryParams; }, res: { json: (arg0: { data: { name: string; email: string; id: string; createdAt: Date; }[]; meta: { total: number; }; }) => void; }) {
    const queryOptions = buildUserQuery(req.query);
    const users = await prisma.user.findMany(queryOptions);
    const total = await prisma.user.count({
      where: queryOptions.where,
    });

    res.json({
      data: users,
      meta: {
        total,
      },
    });
  },

  async createUser(req: Request, res: Response) {
    const { name, email } = req.body;

    if (!name || !email) {
      throw ApiError.BadRequest("Name and email are required");
    }

    const newUser = await userService.create({ name, email });
    res.status(201).json(newUser);
  },

  async deleteUser(req: Request<DeleteUserParams>, res: Response) {
    const { id } = req.params;

    if (!id) {
      throw ApiError.BadRequest("User id is required");
    }

    const deleted = await userService.delete(id);
    res.json({ message: "User deleted", user: deleted });
  },
};