import type { ApiInstance } from "@/apps/api.ts";
import { HealthResponseSchema } from "@/types/ApiType.ts";

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
  app.get("/health", () => ({ status: "ok", ts: new Date().toISOString() }), {
    response: {
      200: {...HealthResponseSchema, description: "Server health status and current timestamp."},
    },
    detail: {
      tags: ["Health"],
      summary: "Liveness/readiness probe",
      description: "Check the health status and current timestamp of the server. This endpoint is used for liveness and readiness probes in containerized environments. No authentication required.",
      parameters: [
        {
          name: "X-API-Key",
          description: "API key used for authentication (not required for this endpoint).",
          in: "header",
          required: false,
          schema: { type: "string", example: "your-api-key" },
        },
      ],
    },
  });
}
