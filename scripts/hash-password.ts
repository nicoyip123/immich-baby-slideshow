import { hashPassword } from "../src/server/security/password.js";
import { pathToFileURL } from "node:url";

type DataListener = (chunk: Buffer | string) => void;
type EndListener = () => void;
type ErrorListener = (error: Error) => void;

export interface PasswordInput {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  resume(): void;
  pause(): void;
  on(event: "data", listener: DataListener): unknown;
  once(event: "end", listener: EndListener): unknown;
  once(event: "error", listener: ErrorListener): unknown;
  off(event: "data", listener: DataListener): unknown;
  off(event: "end", listener: EndListener): unknown;
  off(event: "error", listener: ErrorListener): unknown;
}

export interface PasswordOutput {
  write(value: string): unknown;
}

export async function readPassword(
  input: PasswordInput = process.stdin,
  output: PasswordOutput = process.stderr
): Promise<string> {
  output.write("Password: ");
  const setRawMode = input.setRawMode?.bind(input);

  if (!input.isTTY || !setRawMode) throw new Error("Password input must be attached to a TTY");

  return new Promise((resolve, reject) => {
    let password = "";
    let settled = false;
    const initialRawMode = input.isRaw === true;
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") return settle(new Error("Password input cancelled"));
        if (character === "\u0004") return settle(new Error("Password input ended"));
        if (character === "\r" || character === "\n") return settle(password);
        if (character === "\u007f" || character === "\b") password = password.slice(0, -1);
        else password += character;
      }
    };
    const onEnd = () => settle(new Error("Password input ended"));
    const onError = (error: Error) => settle(error);
    const settle = (result: string | Error) => {
      if (settled) return;
      settled = true;

      let cleanupError: Error | undefined;
      const cleanup = (operation: () => unknown) => {
        try {
          operation();
        } catch (error) {
          if (!cleanupError) cleanupError = error instanceof Error ? error : new Error("Password terminal cleanup failed");
        }
      };

      cleanup(() => input.off("data", onData));
      cleanup(() => input.off("end", onEnd));
      cleanup(() => input.off("error", onError));
      cleanup(() => setRawMode(initialRawMode));
      cleanup(() => input.pause());
      cleanup(() => output.write("\n"));

      if (result instanceof Error) reject(result);
      else if (cleanupError) reject(cleanupError);
      else resolve(result);
    };

    try {
      input.on("data", onData);
      input.once("end", onEnd);
      input.once("error", onError);
      setRawMode(true);
      input.resume();
    } catch (error) {
      settle(error instanceof Error ? error : new Error("Password terminal setup failed"));
    }
  });
}

async function main(): Promise<void> {
  if (process.argv.length > 2) throw new Error("Password must be entered interactively, not as an argument");
  const password = await readPassword();
  const hash = await hashPassword(password);
  process.stdout.write(`${hash}\n`);
}

const invokedScript = process.argv[1];
if (invokedScript && import.meta.url === pathToFileURL(invokedScript).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unable to hash password";
    process.stderr.write(`Error: ${message}\n`);
    process.exitCode = 1;
  });
}
