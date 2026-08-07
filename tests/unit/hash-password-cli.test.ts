import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPassword, type PasswordInput } from "../../scripts/hash-password.js";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

type DataListener = (chunk: Buffer | string) => void;
type EndListener = () => void;
type ErrorListener = (error: Error) => void;

class MockTtyInput implements PasswordInput {
  isTTY = true;
  isRaw: boolean;
  readonly rawModeCalls: boolean[] = [];
  readonly offCalls: Array<"data" | "end" | "error"> = [];
  pauseCalls = 0;
  private dataListeners: DataListener[] = [];
  private endListeners: EndListener[] = [];
  private errorListeners: ErrorListener[] = [];

  constructor(isRaw = false) {
    this.isRaw = isRaw;
  }

  setRawMode(mode: boolean): this {
    this.isRaw = mode;
    this.rawModeCalls.push(mode);
    return this;
  }

  pause(): this {
    this.pauseCalls += 1;
    return this;
  }

  resume(): this {
    return this;
  }

  on(event: "data", listener: DataListener): this {
    this.dataListeners.push(listener);
    return this;
  }

  once(event: "end", listener: EndListener): this;
  once(event: "error", listener: ErrorListener): this;
  once(event: "end" | "error", listener: EndListener | ErrorListener): this {
    if (event === "end") this.endListeners.push(listener as EndListener);
    else this.errorListeners.push(listener as ErrorListener);
    return this;
  }

  off(event: "data", listener: DataListener): this;
  off(event: "end", listener: EndListener): this;
  off(event: "error", listener: ErrorListener): this;
  off(event: "data" | "end" | "error", listener: DataListener | EndListener | ErrorListener): this {
    this.offCalls.push(event);
    if (event === "data") this.dataListeners = this.dataListeners.filter((candidate) => candidate !== listener);
    else if (event === "end") this.endListeners = this.endListeners.filter((candidate) => candidate !== listener);
    else this.errorListeners = this.errorListeners.filter((candidate) => candidate !== listener);
    return this;
  }

  write(value: string): boolean {
    for (const listener of [...this.dataListeners]) listener(value);
    return true;
  }

  end(): void {
    for (const listener of [...this.endListeners]) listener();
  }

  emitError(error: Error): void {
    for (const listener of [...this.errorListeners]) listener(error);
  }
}

class FailingTtyInput extends MockTtyInput {
  constructor(private readonly failurePoint: "enableRaw" | "resume" | "restoreRaw" | "removeDataListener") {
    super();
  }

  override setRawMode(mode: boolean): this {
    super.setRawMode(mode);
    if ((mode && this.failurePoint === "enableRaw") || (!mode && this.failurePoint === "restoreRaw")) {
      throw new Error(`${this.failurePoint} failed`);
    }
    return this;
  }

  override resume(): this {
    if (this.failurePoint === "resume") throw new Error("resume failed");
    return super.resume();
  }

  override off(event: "data", listener: DataListener): this;
  override off(event: "end", listener: EndListener): this;
  override off(event: "error", listener: ErrorListener): this;
  override off(event: "data" | "end" | "error", listener: DataListener | EndListener | ErrorListener): this {
    if (event === "data" && this.failurePoint === "removeDataListener") {
      this.offCalls.push(event);
      throw new Error("removeDataListener failed");
    }
    if (event === "data") return super.off(event, listener as DataListener);
    if (event === "end") return super.off(event, listener as EndListener);
    return super.off(event, listener as ErrorListener);
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
    const password = readPassword(input, new PassThrough());
    input.write("family secret\r");

    await expect(password).resolves.toBe("family secret");
    expect(input.isRaw).toBe(true);
    expect(input.rawModeCalls).toEqual([true, true]);
  });

  it("restores terminal state when the input stream errors", async () => {
    const input = new MockTtyInput(true);
    const password = readPassword(input, new PassThrough());

    expect(() => input.emitError(new Error("read failed"))).not.toThrow();
    await expect(password).rejects.toThrow("read failed");
    expect(input.isRaw).toBe(true);
  });

  it("restores raw state when Ctrl-C cancels input", async () => {
    const input = new MockTtyInput(true);
    const password = readPassword(input, new PassThrough());
    input.write("\u0003");

    await expect(password).rejects.toThrow("cancelled");
    expect(input.isRaw).toBe(true);
  });

  it("restores raw state when input ends", async () => {
    const input = new MockTtyInput(true);
    const password = readPassword(input, new PassThrough());
    input.end();

    await expect(password).rejects.toThrow("ended");
    expect(input.isRaw).toBe(true);
  });

  it("restores state when raw-mode setup throws", async () => {
    const input = new FailingTtyInput("enableRaw");
    const password = readPassword(input, new PassThrough());

    await expect(password).rejects.toThrow("enableRaw failed");
    expect(input.isRaw).toBe(false);
    expect(input.rawModeCalls).toEqual([true, false]);
    expect(input.pauseCalls).toBe(1);
  });

  it("restores state when resuming input throws", async () => {
    const input = new FailingTtyInput("resume");
    const password = readPassword(input, new PassThrough());

    await expect(password).rejects.toThrow("resume failed");
    expect(input.isRaw).toBe(false);
    expect(input.pauseCalls).toBe(1);
  });

  it("settles and completes cleanup when listener removal throws", async () => {
    const input = new FailingTtyInput("removeDataListener");
    const password = readPassword(input, new PassThrough());

    expect(() => input.write("family secret\r")).not.toThrow();
    await expect(password).rejects.toThrow("removeDataListener failed");
    expect(input.isRaw).toBe(false);
    expect(input.offCalls).toEqual(["data", "end", "error"]);
    expect(input.pauseCalls).toBe(1);
  });

  it("settles and completes cleanup when restoring raw mode throws", async () => {
    const input = new FailingTtyInput("restoreRaw");
    const password = readPassword(input, new PassThrough());

    expect(() => input.write("family secret\r")).not.toThrow();
    await expect(password).rejects.toThrow("restoreRaw failed");
    expect(input.offCalls).toEqual(["data", "end", "error"]);
    expect(input.pauseCalls).toBe(1);
  });
});
