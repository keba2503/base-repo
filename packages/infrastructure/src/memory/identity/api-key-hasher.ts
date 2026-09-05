import type { ApiKeyHasher, HashApiKeyRequest, VerifyApiKeyRequest } from "@base/application";

const fnvOffsetBasis = 0xcbf29ce484222325n;
const fnvPrime = 0x100000001b3n;
const sixtyFourBits = 0xffffffffffffffffn;

function fnv1a64(value: string): string {
  let hash = fnvOffsetBasis;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * fnvPrime) & sixtyFourBits;
  }
  return hash.toString(16).padStart(16, "0");
}

export const inMemoryHashMarker = "memory:";

export class InMemoryApiKeyHasher implements ApiKeyHasher {
  hash(request: HashApiKeyRequest): Promise<string> {
    return Promise.resolve(`${inMemoryHashMarker}${fnv1a64(request.key)}`);
  }

  async verify(request: VerifyApiKeyRequest): Promise<boolean> {
    return (await this.hash({ key: request.key })) === request.hash;
  }
}
