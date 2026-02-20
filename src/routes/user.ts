import { Router } from "express";
import { userController } from "../controllers/user.ts";
import { validate } from "../middlewares/validate.ts";
import {createUserSchema, userIdParamSchema} from '../validators/user.js';
import { catchAsync } from "../middlewares/catch-async.ts";

const router = Router();

router.get("/", catchAsync(userController.getUsers));

router.post(
  "/",
  validate(createUserSchema),
  catchAsync(userController.createUser)
);

router.delete(
  "/:id",
  validate(userIdParamSchema, "params"),
  catchAsync(userController.deleteUser)
);

export default router;