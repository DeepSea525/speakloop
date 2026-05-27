const cloudbase = require("@cloudbase/node-sdk");

const ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
const DEFAULT_MODEL = "doubao-seed-2-0-mini-260428";
const MAX_TRANSCRIPT_CHARS = 24000;

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

function extractionPrompt(transcript) {
  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: "你是一个英语口语教练。请从用户的英语对话记录中提取最值得复习的内容。只返回合法 JSON，不要 markdown，不要解释。",
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
- prompt_cn 是练习卡正面，只能写"用户当时想表达什么/原话是什么"，绝对不要包含 better、正确答案、正确问法、标准英文。
- issues 的 prompt_cn 只写类似"你当时想问：丝瓜用英语怎么说。请重新用英文问一遍。"，不要写"正确问法是……"。
- 重点关注中文思维直译、搭配不自然、句子过长、口语替换表达。

对话记录：
${transcript}`,
        },
      ],
    },
  ];
}

function parseExtractionJson(text) {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const parsed = JSON.parse(trimmed);

  return {
    title: typeof parsed.title === "string" ? parsed.title : "英语对话复盘",
    issues: Array.isArray(parsed.issues) ? parsed.issues : [],
    vocabulary: Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [],
    sentences: Array.isArray(parsed.sentences) ? parsed.sentences : [],
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
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
  const { model, transcript } = event.body || {};

  let usageModel;
  let inputChars = 0;

  try {
    const apiKey = process.env.ARK_API_KEY?.trim();
    if (!apiKey) {
      return { code: 503, message: "服务端模型未配置。请在环境变量中设置 ARK_API_KEY。" };
    }

    usageModel = model;

    if (!transcript?.trim()) {
      return { code: 400, message: "Missing transcript." };
    }
    inputChars = transcript.length;

    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      return { code: 413, message: `Transcript is too long. Please keep it under ${MAX_TRANSCRIPT_CHARS} characters.` };
    }

    const payload = await callArkResponses({
      apiKey,
      model,
      input: extractionPrompt(transcript),
    });

    const text = extractOutputText(payload);
    const result = parseExtractionJson(text);

    await recordAiUsage({
      userId,
      route: "extract",
      model: usageModel,
      inputChars,
      outputChars: text.length,
      status: "success",
    });

    return { code: 0, data: { result, rawText: text } };
  } catch (error) {
    await recordAiUsage({
      userId,
      route: "extract",
      model: usageModel,
      inputChars,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown extraction error.",
    });
    return { code: 500, message: error instanceof Error ? error.message : "Unknown extraction error." };
  }
};
