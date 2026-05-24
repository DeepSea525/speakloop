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
      kind: "issue",
      prompt_cn: "你当时想问：丝瓜用英语怎么说。请重新用英文问一遍。",
      answer_en: "How do you say \"丝瓜\" in English?",
      explanation: "问某个中文词用英语怎么说时，用 How do you say ... in English? 不需要重复 say 或 English。",
      tags: ["question", "vocabulary"],
      difficulty: 2,
      due_at: now,
    },
    {
      id: "seed_2",
      kind: "sentence",
      prompt_cn: "想表达：我今天早上七点左右起床，然后给自己做了粽子。",
      answer_en: "I woke up at around 7 a.m. today, and then I cooked some zongzi for myself.",
      explanation: "讲今天已经发生的事情，用 woke up。at around 7 a.m. 比 about 7:00 a.m. 更口语。",
      tags: ["daily life", "past tense"],
      difficulty: 2,
      due_at: now,
    },
    {
      id: "seed_3",
      kind: "phrase",
      prompt_cn: "想表达：副业，主业之外做的赚钱项目。",
      answer_en: "side hustle",
      explanation: "A side hustle is extra work or a small business outside your main job.",
      tags: ["work", "money"],
      difficulty: 2,
      due_at: now,
    },
  ];
}
