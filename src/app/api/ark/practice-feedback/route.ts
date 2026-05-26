import { NextResponse } from "next/server";
import {
  callArkResponses,
  extractOutputText,
  parsePracticeFeedbackJson,
  practiceFeedbackPrompt,
} from "@/lib/ark";
import { getArkApiKey, getAuthenticatedUserFromRequest, jsonError, recordAiUsage } from "@/lib/ark-server";

const MAX_ANSWER_CHARS = 4000;

export async function POST(request: Request) {
  let auth: Awaited<ReturnType<typeof getAuthenticatedUserFromRequest>> | null = null;
  let usageModel: string | undefined;
  let inputChars = 0;

  try {
    auth = await getAuthenticatedUserFromRequest(request);
    const apiKey = getArkApiKey();
    const body = (await request.json()) as {
      model?: string;
      promptCn?: string;
      referenceAnswer?: string;
      learnerAnswer?: string;
    };
    usageModel = body.model;

    const promptCn = body.promptCn?.trim();
    const referenceAnswer = body.referenceAnswer?.trim();
    const learnerAnswer = body.learnerAnswer?.trim();

    if (!promptCn || !referenceAnswer || !learnerAnswer) {
      return NextResponse.json({ error: "Missing practice content." }, { status: 400 });
    }
    inputChars = promptCn.length + referenceAnswer.length + learnerAnswer.length;

    if (learnerAnswer.length > MAX_ANSWER_CHARS) {
      return NextResponse.json(
        { error: `Answer is too long. Please keep it under ${MAX_ANSWER_CHARS} characters.` },
        { status: 413 },
      );
    }

    const payload = await callArkResponses({
      apiKey,
      model: body.model,
      input: practiceFeedbackPrompt({
        promptCn,
        referenceAnswer,
        learnerAnswer,
      }),
    });

    const text = extractOutputText(payload);
    const result = parsePracticeFeedbackJson(text);

    await recordAiUsage(auth, {
      route: "practice-feedback",
      model: usageModel,
      inputChars,
      outputChars: text.length,
      status: "success",
    });

    return NextResponse.json({ result, rawText: text });
  } catch (error) {
    await recordAiUsage(auth, {
      route: "practice-feedback",
      model: usageModel,
      inputChars,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown practice feedback error.",
    });
    return jsonError(error, "Unknown practice feedback error.");
  }
}
