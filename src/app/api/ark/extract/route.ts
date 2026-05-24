import { NextResponse } from "next/server";
import { callArkResponses, extractOutputText, extractionPrompt, parseExtractionJson } from "@/lib/ark";

const MAX_TRANSCRIPT_CHARS = 24000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      apiKey?: string;
      model?: string;
      transcript?: string;
    };

    if (!body.apiKey?.trim()) {
      return NextResponse.json({ error: "Missing Ark API key." }, { status: 400 });
    }

    const transcript = body.transcript?.trim();
    if (!transcript) {
      return NextResponse.json({ error: "Missing transcript." }, { status: 400 });
    }

    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      return NextResponse.json(
        { error: `Transcript is too long. Please keep it under ${MAX_TRANSCRIPT_CHARS} characters.` },
        { status: 413 },
      );
    }

    const payload = await callArkResponses({
      apiKey: body.apiKey.trim(),
      model: body.model,
      input: extractionPrompt(transcript),
    });

    const text = extractOutputText(payload);
    const result = parseExtractionJson(text);

    return NextResponse.json({ result, rawText: text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown extraction error." },
      { status: 500 },
    );
  }
}
