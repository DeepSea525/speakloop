const cloudbase = require("@cloudbase/node-sdk");

const ARK_URL = "https://ark.cn-beijing.volces.com/api/v3/responses";
const DEFAULT_MODEL = "doubao-seed-2-0-mini-260428";

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

function chatMessagesToArkInput(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: [{ type: "input_text", text: message.content }],
  }));
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
  const { model, messages, scene } = event.body || {};

  let usageModel;
  let inputChars = 0;

  try {
    const apiKey = process.env.ARK_API_KEY?.trim();
    if (!apiKey) {
      return { code: 503, message: "服务端模型未配置。请在环境变量中设置 ARK_API_KEY。" };
    }

    usageModel = model;

    if (!Array.isArray(messages) || messages.length === 0) {
      return { code: 400, message: "Missing messages." };
    }

    inputChars = messages.reduce((total, message) => total + (message.content?.length || 0), 0);

    const payload = await callArkResponses({
      apiKey,
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You are a warm, natural English speaking partner for a Chinese adult learner.",
                "Your job is to keep the conversation moving so the learner speaks more English.",
                "Do not correct grammar, spelling, tense, word choice, punctuation, or pronunciation unless the learner explicitly asks for correction.",
                "Do not say things like 'mistake', 'correction', 'natural sentence', or 'repeat this'. Grammar review is handled later by another AI in a separate review step.",
                "If the learner's meaning is understandable but unnatural, you may briefly restate what they likely mean using natural English, then keep the conversation going.",
                "Only restate one useful expression at most. Do not explain grammar.",
                "Reply like a curious friend: acknowledge what they said, react naturally, and ask one specific follow-up question.",
                "Keep replies short and easy to answer: usually 1-3 sentences, simple spoken English, friendly tone.",
                "If the learner uses Chinese, gently invite them to try saying one small part in English.",
                `Current practice scene: ${scene?.trim() || "daily life"}.`,
              ].join(" "),
            },
          ],
        },
        ...chatMessagesToArkInput(messages.slice(-12)),
      ],
    });

    const text = extractOutputText(payload);

    await recordAiUsage({
      userId,
      route: "chat",
      model: usageModel,
      inputChars,
      outputChars: text.length,
      status: "success",
    });

    return { code: 0, data: { text } };
  } catch (error) {
    await recordAiUsage({
      userId,
      route: "chat",
      model: modelName(usageModel),
      inputChars,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown Ark chat error.",
    });
    return { code: 500, message: error instanceof Error ? error.message : "Unknown Ark chat error." };
  }
};
