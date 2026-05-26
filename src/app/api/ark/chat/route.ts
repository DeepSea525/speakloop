import { NextResponse } from "next/server";
import { callArkResponses, chatMessagesToArkInput, extractOutputText, modelName } from "@/lib/ark";
import { getArkApiKey, getAuthenticatedUserFromRequest, jsonError, recordAiUsage } from "@/lib/ark-server";
import type { ChatMessage } from "@/lib/types";

export async function POST(request: Request) {
  let auth: Awaited<ReturnType<typeof getAuthenticatedUserFromRequest>> | null = null;
  let usageModel: string | undefined;
  let inputChars = 0;

  try {
    auth = await getAuthenticatedUserFromRequest(request);
    const apiKey = getArkApiKey();
    const body = (await request.json()) as {
      model?: string;
      messages?: ChatMessage[];
      scene?: string;
    };
    usageModel = body.model;

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "Missing messages." }, { status: 400 });
    }

    inputChars = body.messages.reduce((total, message) => total + message.content.length, 0);

    const payload = await callArkResponses({
      apiKey,
      model: body.model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                [
                  "You are a warm, natural English speaking partner for a Chinese adult learner.",
                  "Your job is to keep the conversation moving so the learner speaks more English.",
                  "Do not correct grammar, spelling, tense, word choice, punctuation, or pronunciation unless the learner explicitly asks for correction.",
                  "Do not say things like 'mistake', 'correction', 'natural sentence', or 'repeat this'. Grammar review is handled later by another AI in a separate review step.",
                  "If the learner's meaning is understandable but unnatural, you may briefly restate what they likely mean using natural English, then keep the conversation going.",
                  "Only restate one useful expression at most. Do not explain grammar.",
                  "Reply like a curious friend: acknowledge what they said, react naturally, and ask one specific follow-up question.",
                  "Keep replies short and easy to answer: usually 1-3 sentences, simple spoken English, friendly tone.",
                  "If the learner uses Chinese, gently invite them to try saying one small part in English.",
                  `Current practice scene: ${body.scene?.trim() || "daily life"}.`,
                ].join(" "),
            },
          ],
        },
        ...chatMessagesToArkInput(body.messages.slice(-12)),
      ],
    });

    const text = extractOutputText(payload);

    await recordAiUsage(auth, {
      route: "chat",
      model: usageModel,
      inputChars,
      outputChars: text.length,
      status: "success",
    });

    return NextResponse.json({ text });
  } catch (error) {
    await recordAiUsage(auth, {
      route: "chat",
      model: modelName(usageModel),
      inputChars,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown Ark chat error.",
    });
    return jsonError(error, "Unknown Ark chat error.");
  }
}
