export const reviewedTrailer = "Reviewed-by:";
export const exemptTrailer = "Review-exempt:";
export const requiredReviewers = ["layer-guardian", "security-reviewer"] as const;

export type TrailerFailure = { readonly reason: string };

function trailerValue(message: string, trailer: string): string | undefined {
  const lines = message.split("\n");
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith(trailer)) continue;
    const continuations: string[] = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const candidate = lines[next] ?? "";
      if (candidate.trim().length === 0 || candidate.includes(":")) break;
      continuations.push(candidate.trim());
    }
    return [line.slice(trailer.length).trim(), ...continuations].join(" ").trim();
  }
  return undefined;
}

export function checkReviewTrailer(message: string): readonly TrailerFailure[] {
  const reviewed = trailerValue(message, reviewedTrailer);
  const exempt = trailerValue(message, exemptTrailer);

  if (reviewed === undefined && exempt === undefined) {
    return [
      {
        reason: `commit is missing a "${reviewedTrailer}" trailer naming who reviewed it, or a "${exemptTrailer}" trailer stating why review does not apply`,
      },
    ];
  }

  if (exempt !== undefined) {
    return exempt.length === 0 ? [{ reason: `${exemptTrailer} trailer is present but empty` }] : [];
  }

  const named = (reviewed ?? "").split(",").map((name) => name.trim());
  const missing = requiredReviewers.filter((reviewer) => !named.includes(reviewer));
  if (missing.length > 0) {
    return [{ reason: `${reviewedTrailer} trailer is missing ${missing.join(" and ")}` }];
  }

  return [];
}
