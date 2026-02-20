import { Prisma } from "@prisma/client";

export type UserQueryParams = {
  search?: string;
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
};

export function buildUserQuery(query: UserQueryParams) {
  const {
    search,
    page = "1",
    limit = "10",
    sortBy = "createdAt",
    sortOrder = "desc",
    dateFrom,
    dateTo,
  } = query;

  const pageNumber = Number(page);
  const pageSize = Number(limit);

  const where: Prisma.UserWhereInput = {};

  // 🔎 Поиск
  if (search) {
    where.OR = [
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
    ];
  }

  // 📅 Фильтр по дате
  if (dateFrom || dateTo) {
    where.createdAt = {};

    if (dateFrom) {
      where.createdAt.gte = new Date(dateFrom);
    }

    if (dateTo) {
      where.createdAt.lte = new Date(dateTo);
    }
  }

  return {
    where,
    skip: (pageNumber - 1) * pageSize,
    take: pageSize,
    orderBy: {
      [sortBy]: sortOrder,
    },
  };
}