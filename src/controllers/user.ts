import type { Request, Response } from "express";
import { userService } from "../services/user.ts";
import { ApiError } from "../errors/api-error.ts";

type DeleteUserParams = {
  id: string;
};

export const userController = {
  async getUsers(req: Request, res: Response) {
    const result = await userService.getAll({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
      sort: (req.query.sort as any) || "createdAt",
      order: (req.query.order as any) || "desc",
      search: req.query.search as string | undefined,
    });

    res.json(result);
  },

  async getUser(req: Request, res: Response) {
    const { id } = req.params;

    if (!id) {
      throw ApiError.BadRequest("User id is required");
    }

    const user = await userService.getById(id as string);

    if (!user) {
      throw ApiError.NotFound("User not found");
    }

    res.json(user);
  },

  async createUser(req: Request, res: Response) {
    const { name, email } = req.body;

    if (!name || !email) {
      throw ApiError.BadRequest("Name and email are required");
    }

    const newUser = await userService.create({ name, email });
    res.status(201).json(newUser);
  },

  async updateUser(req: Request, res: Response) {
    const { id } = req.params;
    const { name, email } = req.body;

    if (!id) {
      throw ApiError.BadRequest("User id is required");
    }

    if (!name && !email) {
      throw ApiError.BadRequest("At least one of name or email is required");
    }

    const updatedUser = await userService.update(id as string, { name, email });
    res.json(updatedUser);
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