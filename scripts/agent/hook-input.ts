export type WriteInput = { file_path: string; content: string };
export type EditInput = { file_path: string; old_string: string; new_string: string; replace_all?: boolean };
export type BashInput = { command: string };

export type HookPayload = {
  hook_event_name: string;
  tool_name?: string;
  tool_input?: WriteInput | EditInput | BashInput;
  stop_hook_active?: boolean;
  prompt?: string;
  cwd?: string;
};

export async function readPayload(): Promise<HookPayload> {
  const raw = await Bun.stdin.text();
  if (raw.trim().length === 0) return { hook_event_name: "unknown" };
  return JSON.parse(raw) as HookPayload;
}

export function projectDir(): string {
  return process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
}

export function block(message: string): never {
  console.error(message);
  process.exit(2);
}
