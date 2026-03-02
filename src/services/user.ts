import { prisma } from "../lib/prisma.ts";
import { Prisma } from "@prisma/client";
import {redis} from '../lib/redis.ts';
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import {ApiError} from '../errors/api-error.js';

type SortField = "createdAt" | "name" | "email";
type SortOrder = "asc" | "desc";

export const userService = {
  async getAll({ page, limit, sort, order, search }: { page: number; limit: number; sort: SortField; order: SortOrder; search?: string | undefined }) {
    const version = (await redis.get("users:version")) ?? "1";
    const cacheKey = `users:v${version}:${page}:${limit}:${sort}:${order}:${search ?? ""}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const skip = (page - 1) * limit;

    const where = search
      ? {
        OR: [
          {
            name: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            email: {
              contains: search,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        where,
        orderBy: {
          [sort]: order,
        },
      }),
      prisma.user.count({ where }),
    ]);

    const result = {
      data: users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        sort,
        order,
        search: search ?? null,
      },
    };

    await redis.set(cacheKey, JSON.stringify(result), {
      EX: 60,
    });

    return result;
  },

  async getById(id: string) {
    const cacheKey = `user:${id}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return null;
    }

    await redis.set(cacheKey, JSON.stringify(user), { EX: 60 });

    return user;
  },

  async create(data: { name: string; email: string, password: string }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const result =  prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        createdAt: true,
      },
    });

    await redis.incr("users:version");

    return result;
  },

  async login({email, password}: {email: string, password: string}) {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw ApiError.NotFound("Invalid email or password");
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      throw ApiError.NotFound("Invalid email or password");
    }

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: "1d" }
    );


    return token;
  },

  async update(id: string, data: { name?: string; email?: string }) {
    const updatedUser = await prisma.user.update({
      where: { id },
      data,
    });

    await Promise.all([
      redis.del(`user:${id}`),
      redis.incr("users:version"),
    ]);


    return updatedUser;
  },

  async delete(id: string) {
    const deletedUser = await prisma.user.delete({
      where: { id },
    });

    await Promise.all([
      redis.del(`user:${id}`),
      redis.incr("users:version"),
    ]);

    return deletedUser;
  },
};