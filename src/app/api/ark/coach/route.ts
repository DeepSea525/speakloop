import { NextResponse } from "next/server";
import { callArkResponses, coachingPrompt, extractOutputText, parseCoachingJson } from "@/lib/ark";

const MAX_TEXT_CHARS = 3000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      apiKey?: string;
      model?: string;
      text?: string;
      scene?: string;
    };

    if (!body.apiKey?.trim()) {
      return NextResponse.json({ error: "Missing Ark API key." }, { status: 400 });
    }

    const text = body.text?.trim();
    if (!text) {
      return NextResponse.json({ error: "Missing coaching text." }, { status: 400 });
    }

    if (text.length > MAX_TEXT_CHARS) {
      return NextResponse.json(
        { error: `Text is too long. Please keep it under ${MAX_TEXT_CHARS} characters.` },
        { status: 413 },
      );
    }

    const payload = await callArkResponses({
      apiKey: body.apiKey.trim(),
      model: body.model,
      input: coachingPrompt({
        text,
        scene: body.scene?.trim() || "日常生活",
      }),
    });

    const rawText = extractOutputText(payload);
    const result = parseCoachingJson(rawText);

    return NextResponse.json({ result, rawText });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown coaching error." },
      { status: 500 },
    );
  }
}
