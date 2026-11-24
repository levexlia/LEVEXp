import { describe, expect, it } from "vitest";
import { isDisplayableImageUrl } from "./index.js";

describe("isDisplayableImageUrl", () => {
  it("allows http(s) URLs and stored upload paths", () => {
    expect(isDisplayableImageUrl("https://example.com/light.jpg")).toBe(true);
    expect(isDisplayableImageUrl("  http://127.0.0.1:5173/uploads/x.png  ")).toBe(true);
    expect(isDisplayableImageUrl("/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png")).toBe(true);
    expect(isDisplayableImageUrl("/uploads/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA.JPG")).toBe(true);
  });

  it("rejects other schemes and lookalike paths", () => {
    expect(isDisplayableImageUrl("javascript:alert(1)")).toBe(false);
    expect(isDisplayableImageUrl("data:image/png;base64,aaaa")).toBe(false);
    expect(isDisplayableImageUrl("//evil.example/a.png")).toBe(false);
    expect(isDisplayableImageUrl("/uploads/not-a-uuid.png")).toBe(false);
    expect(isDisplayableImageUrl("/etc/passwd")).toBe(false);
    expect(isDisplayableImageUrl("https://user:pass@example.com/a.png")).toBe(false);
    expect(isDisplayableImageUrl("")).toBe(false);
  });
});