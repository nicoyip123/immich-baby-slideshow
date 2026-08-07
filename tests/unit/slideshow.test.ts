import { describe, expect, it } from "vitest";
import { formatBabyAge } from "../../src/server/slideshow/age.js";
import { shuffled } from "../../src/server/slideshow/shuffle.js";
import { createImpressionCodec } from "../../src/server/slideshow/impressions.js";

describe("baby age labels", () => {
  it.each([
    ["2025-01-01", "2025-01-01T12:00:00", "0 days old"],
    ["2025-01-01", "2025-01-30T12:00:00", "29 days old"],
    ["2025-01-31", "2025-02-28T12:00:00", "1 month old"],
    ["2024-02-29", "2026-02-28T12:00:00", "2 years old"],
    ["2025-01-01", "2024-12-31T12:00:00", null],
    ["2025-01-01", "not-a-date", null]
  ])("formats %s at %s", (birth, captured, expected) => {
    expect(formatBabyAge(birth!, captured!, "Australia/Melbourne")).toBe(expected);
  });
});

it("uses an unbiased Fisher-Yates copy without mutating input", () => {
  const input = [1, 2, 3, 4];
  const values = [0, 0.5, 0.9];
  const output = shuffled(input, () => values.shift() ?? 0);
  expect(output).toEqual([4, 3, 2, 1]);
  expect(input).toEqual([1, 2, 3, 4]);
});

it("signs expiring asset-bound impression tokens", () => {
  let now = 1_000_000;
  const codec = createImpressionCodec({ secret: "x".repeat(32), now: () => now, nonce: () => "n".repeat(32) });
  const token = codec.issue("asset-1", "IMAGE");
  expect(codec.verify(token)).toEqual({ assetId: "asset-1", mediaType: "IMAGE" });
  expect(codec.verify(`${token}x`)).toBeNull();
  now += 60 * 60 * 1000 + 1;
  expect(codec.verify(token)).toBeNull();
});
