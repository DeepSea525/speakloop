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
      prompt_cn: "我知道中文里想说什么，但不知道怎么用英语自然表达。",
      answer_en: "Sometimes I know what I want to say in Chinese, but I don’t know how to express it naturally in English.",
      explanation: "express it naturally = 自然地表达出来。",
      tags: ["express", "naturally"],
      difficulty: 2,
      due_at: now,
    },
    {
      id: "seed_2",
      kind: "phrase",
      prompt_cn: "想表达：副业",
      answer_en: "side hustle",
      explanation: "A side hustle is extra work or a small business outside your main job.",
      tags: ["work", "money"],
      difficulty: 2,
      due_at: now,
    },
    {
      id: "seed_3",
      kind: "issue",
      prompt_cn: "把“我上夜班”说自然。",
      answer_en: "I work night shifts.",
      explanation: "不要说 I go for work at night。work night shifts 更自然。",
      tags: ["night shift"],
      difficulty: 2,
      due_at: now,
    },
  ];
}
