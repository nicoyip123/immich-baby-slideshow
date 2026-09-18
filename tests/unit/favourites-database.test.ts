import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createStatsDatabase } from "../../src/server/stats/database.js";

it("persists shared favourites, preserving the first save and keeping newest first across stats reset", () => {
  const directory = mkdtempSync(join(tmpdir(), "favourites-"));
  const path = join(directory, "stats.sqlite");
  let now = new Date("2026-08-01T00:00:00Z");
  let database = createStatsDatabase(path, () => now);
  try {
    expect(database.saveFavourite("first", "IMAGE")).toBe(true);
    now = new Date("2026-08-02T00:00:00Z");
    expect(database.saveFavourite("first", "VIDEO")).toBe(false);
    expect(database.saveFavourite("second", "VIDEO")).toBe(true);
    database.record("token", "first", "IMAGE");
    database.reset();
    expect(database.report("all")).toEqual([]);
    database.close();
    database = createStatsDatabase(path);
    expect(database.listFavourites()).toEqual([
      { assetId: "second", mediaType: "VIDEO", savedAt: "2026-08-02T00:00:00.000Z" },
      { assetId: "first", mediaType: "IMAGE", savedAt: "2026-08-01T00:00:00.000Z" }
    ]);
    database.deleteFavourite("second");
    database.deleteFavourite("second");
    expect(database.listFavourites()).toHaveLength(1);
  } finally { database.close(); rmSync(directory, { recursive: true, force: true }); }
});
