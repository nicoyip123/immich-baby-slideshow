import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Docker build dependencies", () => {
  it("installs the native addon toolchain before npm ci", () => {
    const dockerfile = readFileSync(resolve(process.cwd(), "Dockerfile"), "utf8");
    const installIndex = dockerfile.indexOf(
      "apt-get install -y --no-install-recommends python3 make g++",
    );
    const npmCiIndex = dockerfile.indexOf("RUN npm ci");

    expect(installIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeLessThan(npmCiIndex);
  });
});
