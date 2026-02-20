import { prisma } from "../lib/prisma.ts";
import { Prisma } from "@prisma/client";

type SortField = "createdAt" | "name" | "email";
type SortOrder = "asc" | "desc";

export const userService = {
  async getAll({page, limit, sort, order, search}: { page: number, limit: number, sort: SortField, order: SortOrder, search?: string | undefined}) {
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

    return {
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
  },

  async create(data: { name: string; email: string }) {
    return prisma.user.create({
      data,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });
  },

  async delete(id: string) {
    return prisma.user.delete({
      where: { id },
    });
  },
};