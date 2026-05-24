import type { ChatMessage, ExtractionResult, PracticeFeedback } from "@/lib/types";

const ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
const DEFAULT_MODEL = "doubao-seed-2-0-mini-260428";

type ArkInput = {
  role: "user" | "assistant" | "system";
  content: Array<{ type: "input_text"; text: string }>;
};

export function modelName(model?: string) {
  return model?.trim() || DEFAULT_MODEL;
}

export async function callArkResponses({
  apiKey,
  model,
  input,
}: {
  apiKey: string;
  model?: string;
  input: ArkInput[];
}) {
  const response = await fetch(ARK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelName(model),
      input,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Ark request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

export function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as Record<string, unknown>;

  if (typeof data.output_text === "string") return data.output_text;

  const output = data.output;
  if (!Array.isArray(output)) return "";

  const chunks: string[] = [];

  output.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) return;

    content.forEach((part) => {
      if (!part || typeof part !== "object") return;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === "string") chunks.push(partRecord.text);
      if (typeof partRecord.output_text === "string") chunks.push(partRecord.output_text);
    });
  });

  return chunks.join("\n").trim();
}

export function chatMessagesToArkInput(messages: ChatMessage[]): ArkInput[] {
  return messages.map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: message.content }],
  }));
}

export function extractionPrompt(transcript: string): ArkInput[] {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text:
            "你是一个英语口语教练。请从用户的英语对话记录中提取最值得复习的内容。只返回合法 JSON，不要 markdown，不要解释。",
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `请分析下面的英语对话记录，输出 JSON，结构必须完全符合：
{
  "title": "不超过 18 个中文字符的标题",
  "issues": [{"original": "原表达", "reason": "中文说明为什么不自然", "better": "更自然英文", "prompt_cn": "中文练习提示"}],
  "vocabulary": [{"term": "word or phrase", "meaning_cn": "中文意思", "example": "自然英文例句"}],
  "sentences": [{"prompt_cn": "中文提示", "answer_en": "自然英文答案", "note": "中文练习说明"}],
  "topics": ["可以继续练习的话题"]
}

要求：
- issues 选 3-6 个最典型表达问题。
- vocabulary 选 6-12 个高频实用词或短语。
- sentences 选 5-10 个最值得跟读复述的句子。
- prompt_cn 是练习卡正面，只能写“用户当时想表达什么/原话是什么”，绝对不要包含 better、正确答案、正确问法、标准英文。
- issues 的 prompt_cn 只写类似“你当时想问：丝瓜用英语怎么说。请重新用英文问一遍。”，不要写“正确问法是……”。
- 重点关注中文思维直译、搭配不自然、句子过长、口语替换表达。

对话记录：
${transcript}`,
        },
      ],
    },
  ];
}

export function parseExtractionJson(text: string): ExtractionResult {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(trimmed) as Partial<ExtractionResult>;

  return {
    title: typeof parsed.title === "string" ? parsed.title : "英语对话复盘",
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [],
    sentences: Array.isArray(parsed.sentences) ? parsed.sentences : [],
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
  };
}

export function practiceFeedbackPrompt({
  promptCn,
  referenceAnswer,
  learnerAnswer,
}: {
  promptCn: string;
  referenceAnswer: string;
  learnerAnswer: string;
}): ArkInput[] {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text:
            "你是英语口语练习教研。请对比题目含义、参考表达和用户回答，指出含义差距与改进方向。只返回合法 JSON，不要 markdown。",
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `请分析这次练习，输出 JSON，结构必须完全符合：
{
  "summary": "一句中文总结用户回答是否表达到了核心含义",
  "gap": "中文说明用户回答和目标含义/参考表达之间的主要差距",
  "suggestions": ["2-4 条中文改进建议"],
  "alternatives": ["2-4 个同义或近义英文表达"]
}

题目原意：
${promptCn}

参考表达：
${referenceAnswer}

用户回答：
${learnerAnswer}`,
        },
      ],
    },
  ];
}

export function parsePracticeFeedbackJson(text: string): PracticeFeedback {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(trimmed) as Partial<PracticeFeedback>;

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "已完成分析。",
    gap: typeof parsed.gap === "string" ? parsed.gap : "",
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((item) => typeof item === "string") : [],
    alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.filter((item) => typeof item === "string") : [],
  };
}
