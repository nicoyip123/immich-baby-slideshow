import { hashPassword } from "../src/server/security/password.js";
import { pathToFileURL } from "node:url";

export type PasswordInput = NodeJS.ReadableStream & {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => NodeJS.ReadStream;
  resume(): void;
  pause(): void;
};

export async function readPassword(
  input: PasswordInput = process.stdin,
  output: NodeJS.WritableStream = process.stderr
): Promise<string> {
  output.write("Password: ");
  const setRawMode = input.setRawMode?.bind(input);

  if (!input.isTTY || !setRawMode) throw new Error("Password input must be attached to a TTY");

  return new Promise((resolve, reject) => {
    let password = "";
    const initialRawMode = input.isRaw === true;
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") return finish(new Error("Password input cancelled"));
        if (character === "\u0004") return finish(new Error("Password input ended"));
        if (character === "\r" || character === "\n") return finish(password);
        if (character === "\u007f" || character === "\b") password = password.slice(0, -1);
        else password += character;
      }
    };
    const onEnd = () => finish(new Error("Password input ended"));
    const onError = (error: Error) => finish(error);
    const restore = () => {
      input.off("data", onData);
      input.off("end", onEnd);
      input.off("error", onError);
      setRawMode(initialRawMode);
      input.pause();
    };
    const finish = (result: string | Error) => {
      restore();
      output.write("\n");
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    setRawMode(true);
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("error", onError);
    input.resume();
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
