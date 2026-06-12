import * as readline from "readline";

export async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

/**
 * Prompt for a secret without echoing it to the terminal. Reused by any
 * provider setup that has to read a signing secret or API key by hand.
 */
export async function promptHidden(question: string): Promise<string> {
  process.stdout.write(question);
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isTTY ? stdin.isRaw : false;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf-8");

    const CODE_LF = 0x0a;
    const CODE_CR = 0x0d;
    const CODE_CTRL_C = 0x03;
    const CODE_BS = 0x08;
    const CODE_DEL = 0x7f;

    let buffer = "";
    const finish = () => {
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (let i = 0; i < chunk.length; i++) {
        const ch = chunk[i];
        const code = ch.charCodeAt(0);
        if (code === CODE_LF || code === CODE_CR) {
          finish();
          resolve(buffer.trim());
          return;
        }
        if (code === CODE_CTRL_C) {
          finish();
          reject(new Error("Aborted"));
          return;
        }
        if (code === CODE_BS || code === CODE_DEL) {
          buffer = buffer.slice(0, -1);
          continue;
        }
        buffer += ch;
      }
    };
    stdin.on("data", onData);
  });
}
