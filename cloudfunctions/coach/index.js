const cloudbase = require("@cloudbase/node-sdk");

const ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
const DEFAULT_MODEL = "doubao-seed-2-0-mini-260428";
const MAX_TEXT_CHARS = 3000;

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

function coachingPrompt({ text, scene }) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: "你是一个轻量英语表达陪练节点。用户可能输入中文、中英混合或不完整英文。请理解真实意图，给出短、自然、能立刻说出口的英文。只返回合法 JSON，不要 markdown。",
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: `请把用户想表达的意思整理成可练习的英文，输出 JSON，结构必须完全符合：
{
  "intent_cn": "中文确认用户想表达的意思",
  "recommended_en": "最推荐的一句自然英文",
  "alternatives": ["2-3 个更口语/更温柔/更正式的替代表达"],
  "practice_line": "最适合跟读的一句英文",
  "pattern": "可复用表达模板，例如 Don't ... back and forth.",
  "scene": "场景标签"
}

要求：
- 英文表达要短，适合口语。
- 不讲长语法，不批评用户。
- 如果用户输入中文，请直接给可说出口的英文。
- 如果场景为空，按用户内容推断一个简短场景标签。

当前场景：
${scene || "日常生活"}

用户想表达：
${text}`,
        },
      ],
    },
  ];
}

function parseCoachingJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(trimmed);

  function sceneFallback(value) {
    return typeof value === "string" && value.length ? "表达求助" : "日常生活";
  }

  return {
    intent_cn: typeof parsed.intent_cn === "string" ? parsed.intent_cn : "你想表达这句话的自然说法。",
    recommended_en: typeof parsed.recommended_en === "string" ? parsed.recommended_en : "",
    alternatives: Array.isArray(parsed.alternatives)
      ? parsed.alternatives.filter((item) => typeof item === "string")
      : [],
    practice_line: typeof parsed.practice_line === "string" ? parsed.practice_line : parsed.recommended_en || "",
    pattern: typeof parsed.pattern === "string" ? parsed.pattern : "",
    scene: typeof parsed.scene === "string" ? parsed.scene : sceneFallback(parsed.intent_cn),
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
  const { model, text, scene } = event.body || {};

  let usageModel;
  let inputChars = 0;

  try {
    const apiKey = process.env.ARK_API_KEY?.trim();
    if (!apiKey) {
      return { code: 503, message: "服务端模型未配置。请在环境变量中设置 ARK_API_KEY。" };
    }

    usageModel = model;

    if (!text?.trim()) {
      return { code: 400, message: "Missing coaching text." };
    }
    inputChars = text.length;

    if (text.length > MAX_TEXT_CHARS) {
      return { code: 413, message: `Text is too long. Please keep it under ${MAX_TEXT_CHARS} characters.` };
    }

    const payload = await callArkResponses({
      apiKey,
      model,
      input: coachingPrompt({
        text,
        scene: scene?.trim() || "日常生活",
      }),
    });

    const rawText = extractOutputText(payload);
    const result = parseCoachingJson(rawText);

    await recordAiUsage({
      userId,
      route: "coach",
      model: usageModel,
      inputChars,
      outputChars: rawText.length,
      status: "success",
    });

    return { code: 0, data: { result, rawText } };
  } catch (error) {
    await recordAiUsage({
      userId,
      route: "coach",
      model: usageModel,
      inputChars,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown coaching error.",
    });
    return { code: 500, message: error instanceof Error ? error.message : "Unknown coaching error." };
  }
};
