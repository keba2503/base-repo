import { describe, expect, it } from "bun:test";
import { presentApiKey, presentApiKeyCreated } from "../src/index";
import { apiKeyCreatedResponseFactory, apiKeyResponseFactory } from "./factories/api-key-response";

const revokedAt = new Date("2026-02-01T00:00:00.000Z");

describe("present api key created", () => {
  it("shows the plaintext key with the Spanish warning", () => {
    const viewModel = presentApiKeyCreated(apiKeyCreatedResponseFactory(), "es-ES");
    expect([viewModel.plaintextKey, viewModel.warningLabel, viewModel.keyLabel]).toEqual([
      "ak_00000000000040008000000000000001.secret-1",
      "Copia esta clave ahora. No volverá a mostrarse.",
      "Clave",
    ]);
  });

  it("falls back to the English warning for an unknown locale", () => {
    expect(presentApiKeyCreated(apiKeyCreatedResponseFactory(), "de-DE").warningLabel).toBe(
      "Copy this key now. It will not be shown again.",
    );
  });

  it("translates the scopes", () => {
    expect(presentApiKeyCreated(apiKeyCreatedResponseFactory(), "es-ES").scopeLabels).toEqual([
      "Leer organizaciones",
      "Gestionar claves de API",
    ]);
  });

  it("formats the creation date", () => {
    expect(presentApiKeyCreated(apiKeyCreatedResponseFactory(), "en-GB").createdAtLabel).toBe("15 January 2026");
  });

  it("carries only strings and lists of strings", () => {
    const viewModel = presentApiKeyCreated(apiKeyCreatedResponseFactory(), "es-ES");
    const plain = Object.values(viewModel).every(
      (value) => typeof value === "string" || (Array.isArray(value) && value.every((item) => typeof item === "string")),
    );
    expect(plain).toBe(true);
  });
});

describe("present api key", () => {
  it("labels an active key", () => {
    const viewModel = presentApiKey(apiKeyResponseFactory(), "es-ES");
    expect([viewModel.isRevoked, viewModel.statusLabel]).toEqual([false, "Activa"]);
  });

  it("labels a revoked key with its revocation date", () => {
    const viewModel = presentApiKey(apiKeyResponseFactory({ revokedAt }), "es-ES");
    expect([viewModel.isRevoked, viewModel.statusLabel]).toEqual([true, "Revocada · 1 de febrero de 2026"]);
  });

  it("never exposes a plaintext key", () => {
    expect("plaintextKey" in presentApiKey(apiKeyResponseFactory(), "es-ES")).toBe(false);
  });

  it("keeps an unknown scope readable when it has no label", () => {
    expect(presentApiKey(apiKeyResponseFactory({ scopes: ["future:scope"] }), "en-GB").scopeLabels).toEqual([
      "future:scope",
    ]);
  });
});
