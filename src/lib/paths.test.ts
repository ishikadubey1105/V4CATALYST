import { describe, expect, it } from "vitest";
import { safeNext } from "./paths";

describe("safeNext", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/cases/abc?tab=actions")).toBe("/cases/abc?tab=actions");
  });
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "", null, undefined])("rejects %s", (bad) => {
    expect(safeNext(bad)).toBe("/");
  });
});
