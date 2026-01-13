import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import {
  sendBadRequest,
  sendCreated,
  sendInternalError,
  sendMethodNotAllowed,
  sendSuccess,
} from "@/lib/api-response";
import type { ApiErrorResponse, ApiResponse } from "@/lib/api-response";
import { validateApiKey } from "@/lib/auth";
import { sendDiscordError } from "@/lib/discord";
import { sendVerificationEmail } from "@/lib/email";
import { env } from "@/lib/env";
import {
  createSubscriber,
  getSubscriberByEmail,
  resubscribe,
} from "@/lib/subscribers";

const subscribeSchema = z.object({
  email: z.string().email(),
});

type SubscribeResponse = {
  message: string;
  email: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse<SubscribeResponse> | ApiErrorResponse>
): Promise<void> {
  if (req.method !== "POST") {
    sendMethodNotAllowed(res);
    return;
  }

  if (!validateApiKey(req, res)) {
    return;
  }

  const parsed = subscribeSchema.safeParse(req.body);

  if (!parsed.success) {
    sendBadRequest(res, "Invalid email address");
    return;
  }

  const { email } = parsed.data;
  const appUrl = env.APP_URL;

  try {
    // Check if already subscribed
    const existing = await getSubscriberByEmail(email);

    if (existing !== undefined) {
      if (existing.status === "verified") {
        sendSuccess(res, {
          message: "Already subscribed",
          email: existing.email,
        });
        return;
      }

      if (existing.status === "unsubscribed") {
        // Resubscribe
        const resubscribed = await resubscribe(email);
        if (resubscribed !== undefined) {
          sendSuccess(res, {
            message: "Resubscribed successfully",
            email: resubscribed.email,
          });
          return;
        }
      }

      if (existing.status === "pending") {
        // Resend verification email
        await sendVerificationEmail(email, existing.token, appUrl);
        sendSuccess(res, {
          message: "Verification email resent",
          email: existing.email,
        });
        return;
      }
    }

    // Create new subscriber
    const subscriber = await createSubscriber({
      email,
      source: "form",
      status: "pending",
    });

    // Send verification email
    await sendVerificationEmail(email, subscriber.token, appUrl);

    sendCreated(res, {
      message: "Verification email sent",
      email: subscriber.email,
    });
  } catch (error) {
    console.error("Subscribe error:", error);

    // Log error to Discord
    try {
      await sendDiscordError(
        env.DISCORD_LOGGING_WEBHOOK_URL,
        error instanceof Error ? error : new Error(String(error)),
        "Subscribe endpoint error"
      );
    } catch (discordError) {
      console.error("Failed to log error to Discord:", discordError);
    }

    sendInternalError(res, "Failed to process subscription");
  }
}
