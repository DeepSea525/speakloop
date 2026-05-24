import { NextResponse } from "next/server";
import {
  callArkResponses,
  extractOutputText,
  parsePracticeFeedbackJson,
  practiceFeedbackPrompt,
} from "@/lib/ark";

const MAX_ANSWER_CHARS = 4000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      apiKey?: string;
      model?: string;
      promptCn?: string;
      referenceAnswer?: string;
      learnerAnswer?: string;
    };

    if (!body.apiKey?.trim()) {
      return NextResponse.json({ error: "Missing Ark API key." }, { status: 400 });
    }

    const promptCn = body.promptCn?.trim();
    const referenceAnswer = body.referenceAnswer?.trim();
    const learnerAnswer = body.learnerAnswer?.trim();

    if (!promptCn || !referenceAnswer || !learnerAnswer) {
      return NextResponse.json({ error: "Missing practice content." }, { status: 400 });
    }

    if (learnerAnswer.length > MAX_ANSWER_CHARS) {
      return NextResponse.json(
        { error: `Answer is too long. Please keep it under ${MAX_ANSWER_CHARS} characters.` },
        { status: 413 },
      );
    }

    const payload = await callArkResponses({
      apiKey: body.apiKey.trim(),
      model: body.model,
      input: practiceFeedbackPrompt({
        promptCn,
        referenceAnswer,
        learnerAnswer,
      }),
    });

    const text = extractOutputText(payload);
    const result = parsePracticeFeedbackJson(text);

    return NextResponse.json({ result, rawText: text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown practice feedback error." },
      { status: 500 },
    );
  }
}
