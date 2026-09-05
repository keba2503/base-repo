export type HumanVerificationRequest = {
  readonly token: string;
  readonly remoteAddress?: string;
};

export type HumanVerification =
  | { readonly kind: "human" }
  | { readonly kind: "rejected"; readonly reason: string };

export type HumanVerifier = {
  verify(request: HumanVerificationRequest): Promise<HumanVerification>;
};
