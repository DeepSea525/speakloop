import { NextResponse } from "next/server";
import { callArkResponses, extractOutputText, extractionPrompt, parseExtractionJson } from "@/lib/ark";
import { getArkApiKey, getAuthenticatedUserFromRequest, jsonError, recordAiUsage } from "@/lib/ark-server";

const MAX_TRANSCRIPT_CHARS = 24000;

export async function POST(request: Request) {
  let auth: Awaited<ReturnType<typeof getAuthenticatedUserFromRequest>> | null = null;
  let usageModel: string | undefined;
  let inputChars = 0;

  try {
    auth = await getAuthenticatedUserFromRequest(request);
    const apiKey = getArkApiKey();
    const body = (await request.json()) as {
      model?: string;
      transcript?: string;
    };
    usageModel = body.model;

    const transcript = body.transcript?.trim();
    if (!transcript) {
      return NextResponse.json({ error: "Missing transcript." }, { status: 400 });
    }
    inputChars = transcript.length;

    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      return NextResponse.json(
        { error: `Transcript is too long. Please keep it under ${MAX_TRANSCRIPT_CHARS} characters.` },
        { status: 413 },
      );
    }

    const payload = await callArkResponses({
      apiKey,
      model: body.model,
      input: extractionPrompt(transcript),
    });

    const text = extractOutputText(payload);
    const result = parseExtractionJson(text);

    await recordAiUsage(auth, {
      route: "extract",
      model: usageModel,
      inputChars,
      outputChars: text.length,
      status: "success",
    });

    return NextResponse.json({ result, rawText: text });
  } catch (error) {
    await recordAiUsage(auth, {
      route: "extract",
      model: usageModel,
      inputChars,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown extraction error.",
    });
    return jsonError(error, "Unknown extraction error.");
  }
}
