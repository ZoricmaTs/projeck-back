import express from "express";
import { userController } from "./controllers/user.ts";
import { ApiError } from "./errors/api-error.ts";
import {authMiddleware} from './middlewares/authMiddleware.js';
import cors from "cors";


const app = express();
app.use(express.json());

app.use(cors())

// routes
app.get("/check-auth", authMiddleware, userController.checkAuth);
app.get("/users", userController.getUsers);
app.get("/users/:id", userController.getUser);
app.post("/users", userController.createUser);
app.post("/login", userController.loginUser);
app.put("/users/:id", userController.updateUser);
app.delete("/users/:id", userController.deleteUser);

// centralized error handler
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ message: err.message });
  }
  console.error(err);
  res.status(500).json({ message: "Internal Server Error" });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});