import type { NextApiRequest, NextApiResponse } from "next";
import { sendMethodNotAllowed, sendSuccess } from "@/lib/api-response";
import type { ApiErrorResponse, ApiResponse } from "@/lib/api-response";

type HealthResponse = {
  status: string;
  timestamp: string;
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<HealthResponse> | ApiErrorResponse>
): void {
  if (req.method !== "GET") {
    sendMethodNotAllowed(res);
    return;
  }

  sendSuccess(res, {
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
