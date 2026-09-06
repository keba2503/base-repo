export const baseUrl = __ENV.K6_BASE_URL || "http://localhost:3000";

export const apiKeys = (__ENV.K6_API_KEYS || "")
  .split(",")
  .map((key) => key.trim())
  .filter((key) => key.length > 0);

export function apiKeyForThisVu(vu) {
  if (apiKeys.length === 0) {
    throw new Error("Set K6_API_KEYS to a comma separated list with one api key secret per expected virtual user");
  }
  return apiKeys[(vu - 1) % apiKeys.length];
}

export function authHeaders(vu) {
  return {
    Authorization: `Bearer ${apiKeyForThisVu(vu)}`,
    "content-type": "application/json",
  };
}
