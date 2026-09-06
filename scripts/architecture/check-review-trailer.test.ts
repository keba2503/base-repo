import { describe, expect, it } from "bun:test";
import { checkReviewTrailer } from "./check-review-trailer";

describe("checkReviewTrailer", () => {
  it("rejects a commit with neither trailer", () => {
    const failures = checkReviewTrailer("fix(jobs): correct the retry backoff\n");
    expect(failures.some((failure) => failure.reason.includes("missing"))).toBe(true);
  });

  it("passes a commit reviewed by both required reviewers", () => {
    const message = "fix(jobs): correct the retry backoff\n\nReviewed-by: layer-guardian, security-reviewer\n";
    expect(checkReviewTrailer(message)).toEqual([]);
  });

  it("rejects a commit reviewed by only one of the two reviewers", () => {
    const message = "fix(jobs): correct the retry backoff\n\nReviewed-by: layer-guardian\n";
    const failures = checkReviewTrailer(message);
    expect(failures.some((failure) => failure.reason.includes("security-reviewer"))).toBe(true);
  });

  it("accepts an exemption with a reason", () => {
    const message = "docs: fix a typo in the README\n\nReview-exempt: prose only, no code changed\n";
    expect(checkReviewTrailer(message)).toEqual([]);
  });

  it("rejects an empty exemption", () => {
    const message = "docs: fix a typo in the README\n\nReview-exempt:\n";
    const failures = checkReviewTrailer(message);
    expect(failures.some((failure) => failure.reason.includes("empty"))).toBe(true);
  });

  it("ignores reviewer order and extra whitespace", () => {
    const message = "fix(x): y\n\nReviewed-by: security-reviewer,  layer-guardian\n";
    expect(checkReviewTrailer(message)).toEqual([]);
  });

  it("reassembles a Reviewed-by trailer wrapped onto a second line by an editor", () => {
    const message = "fix(x): y\n\nReviewed-by: layer-guardian,\nsecurity-reviewer\n";
    expect(checkReviewTrailer(message)).toEqual([]);
  });

  it("cannot tell a real review from a copied trailer, by design and by construction", () => {
    const claimed = "fix(x): y\n\nReviewed-by: layer-guardian, security-reviewer\n";
    const copiedFromAnotherCommit = "fix(x): y\n\nReviewed-by: layer-guardian, security-reviewer\n";
    expect(checkReviewTrailer(claimed)).toEqual(checkReviewTrailer(copiedFromAnotherCommit));
  });
});
