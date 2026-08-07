import { describe, expect, it } from "vitest";
import { emptyLikedMemoriesCopy } from "../../src/client/copy.js";

describe("slideshow copy", () => {
  it("explains how to select shared-album memories", () => {
    expect(emptyLikedMemoriesCopy).toEqual({
      title: "No liked memories yet",
      detail: "Like a few photos or videos in the shared Immich album, then return."
    });
  });
});
