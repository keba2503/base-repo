import http from "k6/http";
import { check, sleep } from "k6";
import { baseUrl, authHeaders } from "./config.js";

const tenantSlug = __ENV.K6_TENANT_SLUG || "acme-clinic";
const documentId = __ENV.K6_DOCUMENT_ID || "";
const documentsLimit = __ENV.K6_DOCUMENTS_LIMIT || "20";

export const options = {
  scenarios: {
    read_heavy: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "2m", target: 10 },
        { duration: "30s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<300", "p(99)<800"],
    http_req_failed: ["rate<0.01"],
    "http_req_duration{operation:getTenantBySlug}": ["p(95)<200"],
    "http_req_duration{operation:listDocuments}": ["p(95)<250"],
  },
};

export default function readHeavy() {
  const headers = authHeaders(__VU);

  const tenantResponse = http.get(`${baseUrl}/api/v1/tenants/${tenantSlug}`, {
    headers,
    tags: { operation: "getTenantBySlug" },
  });
  check(tenantResponse, {
    "getTenantBySlug answers 200 or 404": (response) => response.status === 200 || response.status === 404,
  });

  const listResponse = http.get(`${baseUrl}/api/v1/documents?limit=${documentsLimit}`, {
    headers,
    tags: { operation: "listDocuments" },
  });
  check(listResponse, {
    "listDocuments answers 200": (response) => response.status === 200,
  });

  if (documentId.length > 0) {
    const documentResponse = http.get(`${baseUrl}/api/v1/documents/${documentId}`, {
      headers,
      tags: { operation: "getDocument" },
    });
    check(documentResponse, {
      "getDocument answers 200 or 404": (response) => response.status === 200 || response.status === 404,
    });
  }

  sleep(1);
}
