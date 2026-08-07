import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPassword, type PasswordInput } from "../../scripts/hash-password.js";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

class MockTtyInput extends PassThrough {
  isTTY = true;
  isRaw: boolean;
  readonly rawModeCalls: boolean[] = [];

  constructor(isRaw = false) {
    super();
    this.isRaw = isRaw;
  }

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    this.rawModeCalls.push(mode);
    return this;
  }
}

describe("hash-password CLI", () => {
  it("rejects a password piped through standard input", () => {
    const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/hash-password.ts"], {
      cwd: projectRoot,
      input: "family secret\n",
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/TTY/);
  });

  it("restores the initial raw state after successful input", async () => {
    const input = new MockTtyInput(true);
    const password = readPassword(input as PasswordInput, new PassThrough());
    input.write("family secret\r");

    await expect(password).resolves.toBe("family secret");
    expect(input.isRaw).toBe(true);
    expect(input.rawModeCalls).toEqual([true, true]);
  });

  it("restores terminal state when the input stream errors", async () => {
    const input = new MockTtyInput(true);
    const password = readPassword(input as PasswordInput, new PassThrough());

    expect(() => input.emit("error", new Error("read failed"))).not.toThrow();
    await expect(password).rejects.toThrow("read failed");
    expect(input.isRaw).toBe(true);
  });

  it("restores raw state when Ctrl-C cancels input", async () => {
    const input = new MockTtyInput(true);
    const password = readPassword(input as PasswordInput, new PassThrough());
    input.write("\u0003");

    await expect(password).rejects.toThrow("cancelled");
    expect(input.isRaw).toBe(true);
  });

  it("restores raw state when input ends", async () => {
    const input = new MockTtyInput(true);
    const password = readPassword(input as PasswordInput, new PassThrough());
    input.end();

    await expect(password).rejects.toThrow("ended");
    expect(input.isRaw).toBe(true);
  });
});
