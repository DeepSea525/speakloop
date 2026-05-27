import { callFunction } from "./cloudbase";
import type { ChatMessage, CoachingResult, ExtractionResult, PracticeFeedback } from "./types";

const MODEL = "doubao-seed-2-0-mini-260428";

export async function extractLearningPoints(transcript: string): Promise<{ result: ExtractionResult; rawText: string }> {
  const result = await callFunction("extract", {
    model: MODEL,
    transcript,
  });
  
  if (result.code !== 0) {
    throw new Error(result.message || "提取失败");
  }
  
  return result.data;
}

export async function chatWithAI(messages: ChatMessage[], scene: string): Promise<string> {
  const result = await callFunction("chat", {
    model: MODEL,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    scene,
  });
  
  if (result.code !== 0) {
    throw new Error(result.message || "对话失败");
  }
  
  return result.data.text;
}

export async function getPracticeFeedback(
  promptCn: string,
  referenceAnswer: string,
  learnerAnswer: string
): Promise<{ result: PracticeFeedback; rawText: string }> {
  const result = await callFunction("practice-feedback", {
    model: MODEL,
    promptCn,
    referenceAnswer,
    learnerAnswer,
  });
  
  if (result.code !== 0) {
    throw new Error(result.message || "反馈失败");
  }
  
  return result.data;
}

export async function getCoaching(text: string, scene: string): Promise<{ result: CoachingResult; rawText: string }> {
  const result = await callFunction("coach", {
    model: MODEL,
    text,
    scene,
  });
  
  if (result.code !== 0) {
    throw new Error(result.message || "辅导失败");
  }
  
  return result.data;
}
