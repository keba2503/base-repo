import { block, readPayload, type BashInput } from "./hook-input";
import { rejectionFor } from "./deny-rules";

const payload = await readPayload();
const input = payload.tool_input as BashInput | undefined;
if (!input?.command) process.exit(0);

const command = input.command;
const reason = rejectionFor(command);
if (reason !== undefined) block(`Command rejected: ${reason}\nCommand: ${command}`);
