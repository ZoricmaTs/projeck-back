import type { Request, Response } from "express";
import { userService } from "../services/user.ts";
import { ApiError } from "../errors/api-error.ts";

type DeleteUserParams = {
  id: string;
};

const allowedSortFields = ["createdAt", "name", "email"] as const;
const allowedOrders = ["asc", "desc"] as const;

export const userController = {
  async getUsers(req: Request, res: Response) {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const sort = allowedSortFields.includes(req.query.sort as any)
      ? (req.query.sort as any)
      : "createdAt";

    const order = allowedOrders.includes(req.query.order as any)
      ? (req.query.order as any)
      : "desc";

    const search = req.query.search
      ? String(req.query.search)
      : undefined;

    const result = await userService.getAll({page, limit, sort, order, search});

    res.json(result);
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