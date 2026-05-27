const cloudbase = require("@cloudbase/node-sdk");

const ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
const DEFAULT_MODEL = "doubao-seed-2-0-mini-260428";
const MAX_ANSWER_CHARS = 4000;

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();

function modelName(model) {
  return model?.trim() || DEFAULT_MODEL;
}

async function callArkResponses({ apiKey, model, input }) {
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

function extractOutputText(payload) {
  if (!payload || typeof payload !== "object") return "";

  if (typeof payload.output_text === "string") return payload.output_text;

  const output = payload.output;
  if (!Array.isArray(output)) return "";

  const chunks = [];

  output.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const content = item.content;
    if (!Array.isArray(content)) return;

    content.forEach((part) => {
      if (!part || typeof part !== "object") return;
      if (typeof part.text === "string") chunks.push(part.text);
      if (typeof part.output_text === "string") chunks.push(part.output_text);
    });
  });

  return chunks.join("\n").trim();
}

function practiceFeedbackPrompt({ promptCn, referenceAnswer, learnerAnswer }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: "你是英语口语练习教研。请对比题目含义、参考表达和用户回答，指出含义差距与改进方向。只返回合法 JSON，不要 markdown。",
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

function parsePracticeFeedbackJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(trimmed);

  return {
    summary: typeof parsed.summary === "string" ? parsed.summary : "已完成分析。",
    gap: typeof parsed.gap === "string" ? parsed.gap : "",
    suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.filter((item) => typeof item === "string") : [],
    alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.filter((item) => typeof item === "string") : [],
  };
}

async function recordAiUsage({ userId, route, model, inputChars, outputChars, status, errorMessage }) {
  try {
    await db.collection("ai_usage_events").add({
      user_id: userId,
      route,
      model: modelName(model),
      input_chars: inputChars ?? 0,
      output_chars: outputChars ?? 0,
      status,
      error_message: errorMessage?.slice(0, 500) ?? null,
      created_at: new Date(),
    });
  } catch {
    // Usage logging should never block the learner's AI flow.
  }
}

exports.main = async (event, context) => {
  const { userId } = event.userInfo;
  const { model, promptCn, referenceAnswer, learnerAnswer } = event.body || {};

  let usageModel;
  let inputChars = 0;

  try {
    const apiKey = process.env.ARK_API_KEY?.trim();
    if (!apiKey) {
      return { code: 503, message: "服务端模型未配置。请在环境变量中设置 ARK_API_KEY。" };
    }

    usageModel = model;

    if (!promptCn?.trim() || !referenceAnswer?.trim() || !learnerAnswer?.trim()) {
      return { code: 400, message: "Missing practice content." };
    }
    inputChars = promptCn.length + referenceAnswer.length + learnerAnswer.length;

    if (learnerAnswer.length > MAX_ANSWER_CHARS) {
      return { code: 413, message: `Answer is too long. Please keep it under ${MAX_ANSWER_CHARS} characters.` };
    }

    const payload = await callArkResponses({
      apiKey,
      model,
      input: practiceFeedbackPrompt({
        promptCn,
        referenceAnswer,
        learnerAnswer,
      }),
    });

    const text = extractOutputText(payload);
    const result = parsePracticeFeedbackJson(text);

    await recordAiUsage({
      userId,
      route: "practice-feedback",
      model: usageModel,
      inputChars,
      outputChars: text.length,
      status: "success",
    });

    return { code: 0, data: { result, rawText: text } };
  } catch (error) {
    await recordAiUsage({
      userId,
      route: "practice-feedback",
      model: usageModel,
      inputChars,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown practice feedback error.",
    });
    return { code: 500, message: error instanceof Error ? error.message : "Unknown practice feedback error." };
  }
};
