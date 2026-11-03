import { describe, it, expect } from "vitest";
import { buildApp } from "./app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await buildApp().inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("ok");
  });
});
