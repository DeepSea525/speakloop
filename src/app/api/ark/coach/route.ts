import { NextResponse } from "next/server";
import { callArkResponses, coachingPrompt, extractOutputText, parseCoachingJson } from "@/lib/ark";
import { getArkApiKey, getAuthenticatedUserFromRequest, jsonError, recordAiUsage } from "@/lib/ark-server";

const MAX_TEXT_CHARS = 3000;

export async function POST(request: Request) {
  let auth: Awaited<ReturnType<typeof getAuthenticatedUserFromRequest>> | null = null;
  let usageModel: string | undefined;
  let inputChars = 0;

  try {
    auth = await getAuthenticatedUserFromRequest(request);
    const apiKey = getArkApiKey();
    const body = (await request.json()) as {
      model?: string;
      text?: string;
      scene?: string;
    };
    usageModel = body.model;

    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Missing coaching text." }, { status: 400 });
    }
    inputChars = text.length;

    if (text.length > MAX_TEXT_CHARS) {
      return NextResponse.json(
        { error: `Text is too long. Please keep it under ${MAX_TEXT_CHARS} characters.` },
        { status: 413 },
      );
    }

    const payload = await callArkResponses({
      apiKey,
      model: body.model,
      input: coachingPrompt({
        text,
        scene: body.scene?.trim() || "日常生活",
      }),
    });

    const rawText = extractOutputText(payload);
    const result = parseCoachingJson(rawText);

    await recordAiUsage(auth, {
      route: "coach",
      model: usageModel,
      inputChars,
      outputChars: rawText.length,
      status: "success",
    });

    return NextResponse.json({ result, rawText });
  } catch (error) {
    await recordAiUsage(auth, {
      route: "coach",
      model: usageModel,
      inputChars,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown coaching error.",
    });
    return jsonError(error, "Unknown coaching error.");
  }
}
