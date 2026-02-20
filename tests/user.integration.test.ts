import request from "supertest";
import app from "../src/index.ts";

describe("Users API Integration", () => {
  let userId: number;


  it("POST /users - create valid user", async () => {
    const res = await request(app)
      .post("/users")
      .send({ name: "Zori", email: "zori@mail.com" });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");
    expect(res.body.name).toBe("Zori");

    userId = res.body.id;
  });

  it("POST /users - invalid email", async () => {
    const res = await request(app)
      .post("/users")
      .send({ name: "Zori", email: "wrong-email" });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("errors");
  });

  it("GET /users - should return array", async () => {
    const res = await request(app).get("/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("DELETE /users/:id - valid id", async () => {
    const res = await request(app).delete(`/users/${userId}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("User deleted");
  });

  it("DELETE /users/:id - invalid id", async () => {
    const res = await request(app).delete(`/users/9999`);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe("User not found");
  });

  it("DELETE /users/:id - invalid param", async () => {
    const res = await request(app).delete(`/users/abc`);
    expect(res.status).toBe(400);
  });
});
