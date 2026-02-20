import { prisma } from "../lib/prisma.ts";

type SortField = "createdAt" | "name" | "email";
type SortOrder = "asc" | "desc";

export const userService = {
  async getAll(
    page: number,
    limit: number,
    sort: SortField,
    order: SortOrder,
  ) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limit,
        orderBy: {
          [sort]: order,
        },
      }),
      prisma.user.count(),
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