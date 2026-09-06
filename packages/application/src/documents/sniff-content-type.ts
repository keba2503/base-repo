import { isAcceptedDocumentContentType, type AcceptedDocumentContentType } from "@base/domain";

type MagicNumber = {
  readonly contentType: AcceptedDocumentContentType;
  readonly signature: readonly number[];
};

const magicNumbers: readonly MagicNumber[] = [
  { contentType: "application/pdf", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { contentType: "image/png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { contentType: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
];

const plainTextSniffWindow = 4_096;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function looksLikePlainText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const window = bytes.subarray(0, Math.min(bytes.length, plainTextSniffWindow));
  if (window.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(window);
    return true;
  } catch {
    return false;
  }
}

export function sniffContentType(bytes: Uint8Array): AcceptedDocumentContentType | undefined {
  for (const magicNumber of magicNumbers) {
    if (startsWith(bytes, magicNumber.signature)) return magicNumber.contentType;
  }
  if (looksLikePlainText(bytes)) {
    const contentType = "text/plain";
    return isAcceptedDocumentContentType(contentType) ? contentType : undefined;
  }
  return undefined;
}
