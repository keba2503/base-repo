import http from "k6/http";
import { check, sleep } from "k6";
import { baseUrl, authHeaders } from "./config.js";

export const options = {
  scenarios: {
    document_upload: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 5 },
        { duration: "1m", target: 5 },
        { duration: "20s", target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<400"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function documentUpload() {
  const headers = authHeaders(__VU);

  const response = http.post(`${baseUrl}/api/v1/documents/upload-urls`, "{}", {
    headers,
    tags: { operation: "createDocumentUpload" },
  });
  check(response, {
    "createDocumentUpload answers 201": (result) => result.status === 201,
    "createDocumentUpload returns an upload url": (result) => {
      const body = result.json();
      return typeof body === "object" && body !== null && typeof body.uploadUrl === "string";
    },
  });

  sleep(3);
}
