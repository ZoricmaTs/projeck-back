import express from "express";
import { userController } from "./controllers/user.ts";
import { ApiError } from "./errors/api-error.ts";
import cors from "cors";
import cookieParser from "cookie-parser";


const app = express();
app.use(express.json());

app.use(cookieParser());

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
}));

// routes

app.get("/users", userController.getUsers);
app.get("/users/:id", userController.getUser);
app.post("/users", userController.createUser);
app.post("/login", userController.loginUser);
app.post("/refresh", userController.refresh);
app.get('/logout', userController.logout);
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