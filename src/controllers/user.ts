import type { Request, Response } from "express";
import { userService } from "../services/user.ts";
import { ApiError } from "../errors/api-error.ts";
import {generateTokens} from '../utils/refresh-token.js';
import jwt from 'jsonwebtoken';

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

  async checkAuth(req: Request, res: Response) {
    res.json({ message: "Authenticated" });
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
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      throw ApiError.BadRequest("Name, email and password are required");
    }

    const newUser = await userService.create({ name, email, password });
    res.status(201).json(newUser);
  },

  async loginUser(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
      throw ApiError.BadRequest("Email and password are required");
    }

    const { accessToken, refreshToken, user } = await userService.login({ email, password });

    // 👇 СТАВИМ REFRESH В COOKIE
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false,      // локально false
      sameSite: "lax",    // для localhost
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      accessToken,
      user,
    });
  },

  async refresh(req: Request, res: Response) {
    const token = req.cookies.refreshToken;

    if (!token) {
      throw ApiError.Unauthorized("Refresh token is required");
    }

    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_REFRESH_SECRET!
      ) as { userId: string };

      const { accessToken, refreshToken } = generateTokens(payload.userId);

      // Ротация refresh токена
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.json({ accessToken });
    } catch {
      throw ApiError.Unauthorized("Invalid refresh token");
    }
  },

  async logout(req: Request, res: Response) {
    res.clearCookie("refreshToken");

    res.json({ message: "Logged out" });
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