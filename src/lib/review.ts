import type { ExtractionResult, ReviewItem, ReviewKind, ReviewRating } from "@/lib/types";

export function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function nextDueDate(rating: ReviewRating) {
  const date = new Date();
  const days = rating === "hard" ? 1 : rating === "easy" ? 3 : 14;
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function isDue(item: Pick<ReviewItem, "due_at" | "mastered_at">) {
  return !item.mastered_at && new Date(item.due_at).getTime() <= Date.now();
}

export function reviewItemsFromExtraction(result: ExtractionResult, conversationId?: string): ReviewItem[] {
  const now = new Date().toISOString();
  const items: ReviewItem[] = [];

  result.issues.forEach((issue) => {
    items.push({
      id: makeId("review"),
      conversation_id: conversationId ?? null,
      kind: "issue",
      prompt_cn: `你当时想表达：${issue.original}。试着重新说一遍。`,
      answer_en: issue.better,
      explanation: issue.prompt_cn ? `${issue.reason}\n${issue.prompt_cn}` : issue.reason,
      tags: ["expression", "rewrite"],
      difficulty: 2,
      due_at: now,
    });
  });

  result.vocabulary.forEach((word) => {
    const kind: ReviewKind = word.term.includes(" ") ? "phrase" : "word";
    items.push({
      id: makeId("review"),
      conversation_id: conversationId ?? null,
      kind,
      prompt_cn: `想表达：${word.meaning_cn}`,
      answer_en: word.term,
      explanation: word.example,
      tags: [kind],
      difficulty: 2,
      due_at: now,
    });
  });

  result.sentences.forEach((sentence) => {
    items.push({
      id: makeId("review"),
      conversation_id: conversationId ?? null,
      kind: "sentence",
      prompt_cn: sentence.prompt_cn,
      answer_en: sentence.answer_en,
      explanation: sentence.note,
      tags: ["sentence", "speaking"],
      difficulty: 2,
      due_at: now,
    });
  });

  return items;
}

export function sampleReviewItems(): ReviewItem[] {
  const now = "2026-01-01T00:00:00.000Z";

  return [
    {
      id: "seed_1",
      kind: "sentence",
      prompt_cn: "想表达：我可以听到 AI 的英文回复，所以能顺便练听力。",
      answer_en: "I can hear the AI's replies, so I can practice listening at the same time.",
      explanation: "at the same time 表示“同时”。hear the AI's replies 比 listen the replies 更自然。",
      tags: ["listening", "ai reply"],
      difficulty: 2,
      due_at: now,
    },
    {
      id: "seed_2",
      kind: "sentence",
      prompt_cn: "想表达：这个产品可以把我的 AI 对话整理成可以复习的学习点。",
      answer_en: "This product can turn my AI conversations into reviewable learning points.",
      explanation: "turn A into B = 把 A 转化成 B。reviewable learning points 指可以后续复习的学习点。",
      tags: ["product", "review"],
      difficulty: 2,
      due_at: now,
    },
    {
      id: "seed_3",
      kind: "sentence",
      prompt_cn: "想表达：练习时，AI 可以分析我的回答，并给我更自然的表达方式。",
      answer_en: "During practice, the AI can analyze my answer and suggest more natural ways to say it.",
      explanation: "suggest more natural ways to say it = 建议更自然的说法。这里用 analyze my answer 很适合描述 AI 评估功能。",
      tags: ["feedback", "speaking"],
      difficulty: 2,
      due_at: now,
    },
    {
      id: "seed_4",
      kind: "phrase",
      prompt_cn: "想表达：一个简单的每日复习队列。",
      answer_en: "a simple daily review queue",
      explanation: "daily review queue 可以表达“每天要复习的一组内容”。queue 在产品里常用来表示待处理列表。",
      tags: ["review", "habit"],
      difficulty: 2,
      due_at: now,
    },
  ];
}
