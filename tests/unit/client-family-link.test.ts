import { describe, expect, it, vi } from "vitest";

import { takeFamilyLinkToken } from "../../src/client/family-link.js";

const token = "ab".repeat(32);

describe("private family-link fragments", () => {
  it("returns an exact token and synchronously erases the fragment", () => {
    const replaceState = vi.fn();
    const location = { hash: `#family=${token}`, pathname: "/memories", search: "?view=all" };
    const history = { state: { preserved: true }, replaceState };

    expect(takeFamilyLinkToken(location, history)).toBe(token);
    expect(replaceState).toHaveBeenCalledOnce();
    expect(replaceState).toHaveBeenCalledWith(history.state, "", "/memories?view=all");
  });

  it.each([
    "#family=",
    `#family=${token.toUpperCase()}`,
    `#family=${token}0`,
    `#family=${token}&extra=1`,
    `#other=${token}`,
    "#ordinary-anchor"
  ])("erases an unusable fragment without returning it: %s", (hash) => {
    const replaceState = vi.fn();
    expect(takeFamilyLinkToken(
      { hash, pathname: "/", search: "" },
      { state: null, replaceState }
    )).toBeUndefined();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/");
  });

  it("does not rewrite a URL without a fragment", () => {
    const replaceState = vi.fn();
    expect(takeFamilyLinkToken(
      { hash: "", pathname: "/", search: "?a=1" },
      { state: null, replaceState }
    )).toBeUndefined();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
