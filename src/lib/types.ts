export type ReviewKind = "word" | "phrase" | "sentence" | "issue";

export type ReviewRating = "hard" | "easy" | "mastered";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
};

export type ConversationSource = "paste" | "chat";

export type ConversationRecord = {
  id: string;
  user_id: string;
  title: string;
  source_type: ConversationSource;
  created_at: string;
};

export type DatabaseMessage = {
  id: string;
  user_id: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
};

export type ReviewItem = {
  id: string;
  user_id?: string;
  conversation_id?: string | null;
  kind: ReviewKind;
  prompt_cn: string;
  answer_en: string;
  explanation: string;
  tags: string[];
  difficulty: number;
  due_at: string;
  mastered_at?: string | null;
  created_at?: string;
};

export type PracticeFeedback = {
  summary: string;
  gap: string;
  suggestions: string[];
  alternatives: string[];
};

export type CoachingResult = {
  intent_cn: string;
  recommended_en: string;
  alternatives: string[];
  practice_line: string;
  pattern: string;
  scene: string;
};

export type ExtractedIssue = {
  original: string;
  reason: string;
  better: string;
  prompt_cn?: string;
};

export type ExtractedVocabulary = {
  term: string;
  meaning_cn: string;
  example: string;
};

export type ExtractedSentence = {
  prompt_cn: string;
  answer_en: string;
  note: string;
};

export type ExtractionResult = {
  title: string;
  issues: ExtractedIssue[];
  vocabulary: ExtractedVocabulary[];
  sentences: ExtractedSentence[];
  topics: string[];
};

export type DatabaseReviewItem = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  kind: ReviewKind;
  prompt_cn: string;
  answer_en: string;
  explanation: string;
  tags: string[] | null;
  difficulty: number;
  due_at: string;
  mastered_at: string | null;
  created_at: string;
};
