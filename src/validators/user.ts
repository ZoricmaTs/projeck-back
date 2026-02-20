import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.email("Invalid email format"),
});

export const userIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^\d+$/, "Id must be a positive integer")
    .transform(Number),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;