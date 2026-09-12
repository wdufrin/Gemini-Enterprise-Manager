import { describe, it, expect } from "vitest";
import { toErrorMessage } from "./errors";

describe("toErrorMessage", () => {
  it("returns the message from a real Error", () => {
    expect(toErrorMessage(new Error("Boom"))).toBe("Boom");
  });

  it("returns a thrown string as-is", () => {
    expect(toErrorMessage("something broke")).toBe("something broke");
  });

  it("reads message off a non-Error object", () => {
    // Some GCP client libraries reject with a plain object.
    expect(toErrorMessage({ message: "API quota exceeded" })).toBe(
      "API quota exceeded",
    );
  });

  it("uses the default fallback for values with no message", () => {
    expect(toErrorMessage(undefined)).toBe("An unknown error occurred.");
    expect(toErrorMessage(null)).toBe("An unknown error occurred.");
    expect(toErrorMessage({})).toBe("An unknown error occurred.");
  });

  it("prefers a caller-supplied fallback", () => {
    expect(toErrorMessage(undefined, "Deploy failed.")).toBe("Deploy failed.");
  });

  it("does not surface an empty message, which would render as blank", () => {
    // This is the regression the helper exists to prevent: `err.message` on an
    // Error constructed with no message produced "Deployment failed: ".
    expect(toErrorMessage(new Error(""), "Deploy failed.")).toBe(
      "Deploy failed.",
    );
    expect(toErrorMessage({ message: "" }, "Deploy failed.")).toBe(
      "Deploy failed.",
    );
  });

  it("never returns undefined for odd thrown values", () => {
    for (const value of [0, false, NaN, [], Symbol("x")]) {
      expect(typeof toErrorMessage(value)).toBe("string");
      expect(toErrorMessage(value).length).toBeGreaterThan(0);
    }
  });
});
