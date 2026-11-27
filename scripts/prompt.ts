import { createInterface } from "node:readline/promises";

/** שואל שאלה רגילה. */
export async function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

/** שואל שאלה בלי להציג את התשובה על המסך (לסיסמאות ומפתחות). */
export async function askHidden(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  let muted = false;
  const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
  rlAny._writeToOutput = (s: string) => {
    if (!muted || s.includes("\n")) process.stdout.write(muted ? "\n" : s);
    else process.stdout.write("*");
  };
  const p = rl.question(question);
  muted = true;
  const answer = (await p).trim();
  rl.close();
  return answer;
}

/** מנקה את המסך כולל היסטוריית הגלילה. */
export function clearScreen() {
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
}
