import express from "express";
import { userController } from "./controllers/user.ts";
import cors from "cors";
import cookieParser from "cookie-parser";
import {errorHandler} from './middlewares/error.js';


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
app.post("/register", userController.createUser);
app.post("/login", userController.loginUser);
app.post("/refresh", userController.refresh);
app.get('/logout', userController.logout);
app.put("/users/:id", userController.updateUser);
app.delete("/users/:id", userController.deleteUser);

app.use(errorHandler);

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});