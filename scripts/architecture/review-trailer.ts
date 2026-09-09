import { readFileSync } from "node:fs";
import { checkReviewTrailer, exemptTrailer, reviewedTrailer } from "./check-review-trailer";

const messagePath = process.argv[2];
if (messagePath === undefined) {
  console.error("usage: bun scripts/architecture/review-trailer.ts <commit-message-file>");
  process.exit(1);
}

const message = readFileSync(messagePath, "utf8");
const failures = checkReviewTrailer(message);

if (failures.length > 0) {
  console.error(`Commit rejected, rule 13 requires review evidence:`);
  for (const failure of failures) console.error(`  ${failure.reason}`);
  console.error(
    `Add either "${reviewedTrailer} layer-guardian, security-reviewer" once both have read the diff, or "${exemptTrailer} <why>" for a change with nothing to review.`,
  );
  process.exit(1);
}

console.log("commit carries review evidence");
