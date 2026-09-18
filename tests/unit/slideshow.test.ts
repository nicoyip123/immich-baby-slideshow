import { describe, expect, it } from "vitest";
import { formatBabyAge } from "../../src/server/slideshow/age.js";
import { shuffled } from "../../src/server/slideshow/shuffle.js";
import { createImpressionCodec } from "../../src/server/slideshow/impressions.js";

describe("baby age labels", () => {
  it.each([
    ["2025-01-01", "2025-01-04T12:00:00", "3天大", "3天大"],
    ["2025-01-01", "2025-03-04T12:00:00", "2个月3天", "2個月3天"],
    ["2024-01-01", "2025-03-04T12:00:00", "1岁2个月3天", "1歲2個月3天"],
    ["2024-02-29", "2025-02-28T12:00:00", "1岁0个月0天", "1歲0個月0天"],
    ["2025-01-01", "2025-02-28T13:30:00Z", "2个月0天", "2個月0天"]
  ])("localizes calendar age including leap anniversaries and local dates", (birth, captured, simplified, traditional) => {
    expect(formatBabyAge(birth, captured, "Australia/Melbourne", "zh-Hans")).toBe(simplified);
    expect(formatBabyAge(birth, captured, "Australia/Melbourne", "zh-Hant")).toBe(traditional);
    expect(formatBabyAge(birth, captured, "Australia/Melbourne", "en")).toBe(formatBabyAge(birth, captured, "Australia/Melbourne"));
  });

  it.each(["en", "zh-Hans", "zh-Hant"] as const)("keeps invalid and pre-birth dates null in %s", (locale) => {
    expect(formatBabyAge("2025-01-01", "invalid", "Australia/Melbourne", locale)).toBeNull();
    expect(formatBabyAge("2025-02-30", "2025-03-04T12:00:00", "Australia/Melbourne", locale)).toBeNull();
    expect(formatBabyAge("2025-01-01", "2024-12-31T12:00:00", "Australia/Melbourne", locale)).toBeNull();
  });

  it.each([
    ["2025-01-01", "2025-01-01T12:00:00", "0 days old"],
    ["2025-01-01", "2025-01-02T12:00:00", "1 day old"],
    ["2025-01-01", "2025-01-30T12:00:00", "29 days old"]
  ])("formats day-only ages with singular and plural units", (birth, captured, expected) => {
    expect(formatBabyAge(birth, captured, "Australia/Melbourne")).toBe(expected);
  });

  it.each([
    ["2025-01-01", "2025-02-01T12:00:00", "1 month, 0 days old"],
    ["2025-01-01", "2025-02-02T12:00:00", "1 month, 1 day old"],
    ["2025-01-01", "2025-03-06T12:00:00", "2 months, 5 days old"],
    ["2025-01-31", "2025-03-01T12:00:00", "1 month, 1 day old"],
    ["2025-01-31", "2025-03-30T12:00:00", "1 month, 30 days old"],
    ["2025-01-31", "2025-03-31T12:00:00", "2 months, 0 days old"]
  ])("formats completed calendar months and remaining days", (birth, captured, expected) => {
    expect(formatBabyAge(birth, captured, "Australia/Melbourne")).toBe(expected);
  });

  it.each([
    ["2024-01-01", "2025-01-01T12:00:00", "1 year, 0 months, 0 days old"],
    ["2024-01-01", "2025-02-02T12:00:00", "1 year, 1 month, 1 day old"],
    ["2024-01-01", "2025-03-06T12:00:00", "1 year, 2 months, 5 days old"],
    ["2023-01-01", "2025-03-01T12:00:00", "2 years, 2 months, 0 days old"],
    ["2024-02-29", "2025-02-28T12:00:00", "1 year, 0 months, 0 days old"]
  ])("formats completed calendar years, months, and days", (birth, captured, expected) => {
    expect(formatBabyAge(birth, captured, "Australia/Melbourne")).toBe(expected);
  });

  it("converts timestamped captures to the configured local calendar date", () => {
    expect(formatBabyAge("2025-01-01", "2025-02-28T13:30:00Z", "Australia/Melbourne")).toBe(
      "2 months, 0 days old"
    );
  });

  it.each([
    ["2025-02-30", "2025-03-01T12:00:00"],
    ["2025-01-01", "2025-02-30T12:00:00"],
    ["2025-01-01", "2025-02-30"],
    ["2025-01-01", "2025-02-30 12:00:00Z"],
    ["2025-01-01", "not-a-date"],
    ["not-a-date", "2025-01-01T12:00:00"],
    ["2025-01-01", "2024-12-31T12:00:00"]
  ])("rejects invalid or pre-birth dates", (birth, captured) => {
    expect(formatBabyAge(birth, captured, "Australia/Melbourne")).toBeNull();
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
