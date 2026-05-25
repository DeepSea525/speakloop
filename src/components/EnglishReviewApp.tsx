"use client";

import {
  BookOpen,
  Check,
  ClipboardPaste,
  Headphones,
  History,
  KeyRound,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
  Volume2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  isDue,
  makeId,
  nextDueDate,
  reviewItemsFromExtraction,
  sampleReviewItems,
} from "@/lib/review";
import type {
  ChatMessage,
  CoachingResult,
  ConversationRecord,
  DatabaseMessage,
  DatabaseReviewItem,
  ExtractionResult,
  PracticeFeedback,
  ReviewItem,
  ReviewRating,
} from "@/lib/types";

const MODEL = "doubao-seed-2-0-mini-260428";
const DEFAULT_VOICE_NAME = "google us english";
const DEFAULT_VOICE_RATE = 1;

type BusyState = "extract" | "chat" | "save" | "history" | "evaluate" | "coach" | null;
type TabKey = "chat" | "import" | "review" | "practice";

const SCENES = ["日常生活", "带小朋友", "吃饭", "工作沟通", "朋友闲聊", "旅行", "购物", "解释产品"];

const tabs: Array<{ key: TabKey; label: string; icon: typeof MessageCircle }> = [
  { key: "chat", label: "对话", icon: MessageCircle },
  { key: "import", label: "记录", icon: History },
  { key: "review", label: "复习", icon: BookOpen },
  { key: "practice", label: "练习", icon: Headphones },
];

const INITIAL_MESSAGE: ChatMessage = {
  id: "initial_assistant_message",
  role: "assistant",
  content: "Hi, I’m here to chat with you in English. Say anything about your day, even a small thing, and I’ll keep the conversation going.",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function nowIso() {
  return new Date().toISOString();
}

function toReviewItem(row: DatabaseReviewItem): ReviewItem {
  return {
    id: row.id,
    user_id: row.user_id,
    conversation_id: row.conversation_id,
    kind: row.kind,
    prompt_cn: row.prompt_cn,
    answer_en: row.answer_en,
    explanation: row.explanation,
    tags: row.tags ?? [],
    difficulty: row.difficulty,
    due_at: row.due_at,
    mastered_at: row.mastered_at,
    created_at: row.created_at,
  };
}

export default function EnglishReviewApp() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const speech = useSpeech();
  const [activeTab, setActiveTab] = useState<TabKey>("chat");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [autoReadAssistant, setAutoReadAssistant] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [chatInput, setChatInput] = useState("");
  const [chatScene, setChatScene] = useState(SCENES[0]);
  const [coaching, setCoaching] = useState<CoachingResult | null>(null);
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [extractionSourceType, setExtractionSourceType] = useState<"paste" | "chat">("paste");
  const [extractionSourceText, setExtractionSourceText] = useState("");
  const [items, setItems] = useState<ReviewItem[]>(sampleReviewItems());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [practiceFeedback, setPracticeFeedback] = useState<PracticeFeedback | null>(null);
  const [busy, setBusy] = useState<BusyState>(null);
  const [status, setStatus] = useState(() => {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      return "正在连接学习空间";
    }
    return "演示模式";
  });
  const [error, setError] = useState("");

  const hasSupabase = Boolean(supabase);
  const chatConversations = useMemo(
    () => conversations.filter((conversation) => conversation.source_type === "chat"),
    [conversations],
  );
  const dueItems = useMemo(() => items.filter(isDue), [items]);
  const selectedItem = useMemo(() => {
    return items.find((item) => item.id === selectedItemId) ?? dueItems[0] ?? items[0] ?? null;
  }, [dueItems, items, selectedItemId]);

  useEffect(() => {
    if (!supabase) return;

    const client = supabase;
    let cancelled = false;

    async function init() {
      const { data: sessionData } = await client.auth.getSession();
      let sessionUserId = sessionData.session?.user.id ?? null;

      if (!sessionUserId) {
        const { data, error: signInError } = await client.auth.signInAnonymously();
        if (signInError) {
          setError(signInError.message);
          setStatus("匿名登录失败");
          return;
        }
        sessionUserId = data.user?.id ?? null;
      }

      if (cancelled || !sessionUserId) return;

      setUserId(sessionUserId);
      setStatus("已连接");

      const { data, error: loadError } = await client
        .from("review_items")
        .select("*")
        .order("due_at", { ascending: true })
        .limit(200);

      if (loadError) {
        setError(loadError.message);
        return;
      }

      if (!cancelled && data && data.length > 0) {
        setItems((data as DatabaseReviewItem[]).map(toReviewItem));
      }

      const { data: conversationData, error: conversationError } = await client
        .from("conversations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (conversationError) {
        setError(conversationError.message);
        return;
      }

      if (!cancelled && conversationData) {
        setConversations(conversationData as ConversationRecord[]);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  function saveApiKey(value: string) {
    setApiKey(value);
    localStorage.setItem("arkApiKey", value);
  }

  function saveAutoRead(value: boolean) {
    setAutoReadAssistant(value);
    localStorage.setItem("autoReadAssistant", String(value));
  }

  function syncLocalSettings() {
    const savedApiKey = localStorage.getItem("arkApiKey") || "";
    const savedAutoRead = localStorage.getItem("autoReadAssistant") !== "false";
    setApiKey(savedApiKey);
    setAutoReadAssistant(savedAutoRead);
    return {
      apiKey: savedApiKey,
      autoReadAssistant: savedAutoRead,
    };
  }

  async function createConversation(title: string, sourceType: "paste" | "chat") {
    if (!supabase || !userId) return null;

    const { data, error: insertError } = await supabase
      .from("conversations")
      .insert({
        user_id: userId,
        title,
        source_type: sourceType,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    return (data as ConversationRecord).id;
  }

  async function refreshConversations() {
    if (!supabase || !userId) return;

    const { data, error: loadError } = await supabase
      .from("conversations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    if (loadError) throw loadError;
    setConversations((data ?? []) as ConversationRecord[]);
  }

  async function loadConversation(conversationId: string) {
    if (!supabase || !userId) return;

    setBusy("history");
    setError("");

    try {
      const conversation = conversations.find((candidate) => candidate.id === conversationId) ?? null;
      const { data, error: loadError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (loadError) throw loadError;

      const loadedMessages = ((data ?? []) as DatabaseMessage[]).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.created_at,
      }));

      if (conversation?.source_type === "paste") {
        setTranscript(loadedMessages.map((message) => message.content).join("\n\n"));
        setActiveTab("import");
      } else {
        setChatConversationId(conversationId);
        setMessages(loadedMessages.length ? loadedMessages : [INITIAL_MESSAGE]);
        setActiveTab("chat");
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载历史对话失败。");
    } finally {
      setBusy(null);
    }
  }

  function startNewConversation() {
    setChatConversationId(null);
    setMessages([INITIAL_MESSAGE]);
    setChatInput("");
    setCoaching(null);
    setError("");
    setActiveTab("chat");
  }

  async function saveMessages(conversationId: string, nextMessages: ChatMessage[]) {
    if (!supabase || !userId) return;

    const rows = nextMessages.map((message) => ({
      user_id: userId,
      conversation_id: conversationId,
      role: message.role,
      content: message.content,
      created_at: message.createdAt,
    }));

    const { error: insertError } = await supabase.from("messages").insert(rows);
    if (insertError) throw insertError;
  }

  async function runCoaching(text?: string) {
    const sourceText = (text ?? chatInput).trim();
    const localSettings = syncLocalSettings();
    const currentApiKey = localSettings.apiKey || apiKey;

    if (!currentApiKey.trim()) {
      setError("请先在设置里填写火山方舟 API key。");
      setSettingsOpen(true);
      return;
    }

    if (!sourceText) {
      setError("先输入一句你想表达的中文、英文或中英混合内容。");
      return;
    }

    setBusy("coach");
    setError("");
    setCoaching(null);

    try {
      const response = await fetch("/api/ark/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: currentApiKey.trim(),
          model: MODEL,
          text: sourceText,
          scene: chatScene,
        }),
      });

      const payload = (await response.json()) as { result?: CoachingResult; error?: string };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "表达求助失败。");
      }

      setCoaching(payload.result);
      speech.speak(payload.result.practice_line || payload.result.recommended_en);
    } catch (coachError) {
      setError(coachError instanceof Error ? coachError.message : "表达求助失败。");
    } finally {
      setBusy(null);
    }
  }

  async function addCoachingToReview(result: CoachingResult) {
    const prompt = `场景：${result.scene || chatScene}\n你想说：${result.intent_cn}`;
    const item: ReviewItem = {
      id: makeId("review"),
      kind: "sentence",
      prompt_cn: prompt,
      answer_en: result.recommended_en,
      explanation: [
        result.pattern ? `模板：${result.pattern}` : "",
        result.alternatives.length ? `也可以说：${result.alternatives.join(" / ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      tags: ["coach", result.scene || chatScene],
      difficulty: 2,
      due_at: nowIso(),
    };

    if (supabase && userId) {
      const { data, error: insertError } = await supabase
        .from("review_items")
        .insert({
          user_id: userId,
          conversation_id: chatConversationId,
          kind: item.kind,
          prompt_cn: item.prompt_cn,
          answer_en: item.answer_en,
          explanation: item.explanation,
          tags: item.tags,
          difficulty: item.difficulty,
          due_at: item.due_at,
        })
        .select("*")
        .single();

      if (insertError) {
        setError(insertError.message);
        return;
      }

      const savedItem = toReviewItem(data as DatabaseReviewItem);
      setItems((current) => [savedItem, ...current]);
      setSelectedItemId(savedItem.id);
    } else {
      setItems((current) => [item, ...current]);
      setSelectedItemId(item.id);
    }

    setStatus("已加入复习");
  }

  async function runExtraction(source: "paste" | "chat") {
    const sourceText =
      source === "paste"
        ? transcript.trim()
        : messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");

    const localSettings = syncLocalSettings();
    const currentApiKey = localSettings.apiKey || apiKey;

    if (!currentApiKey.trim()) {
      setError("请先在设置里填写火山方舟 API key。");
      setSettingsOpen(true);
      return;
    }

    if (!sourceText.trim()) {
      setError(source === "paste" ? "请先粘贴对话记录。" : "请先在对话页聊几句。");
      return;
    }

    setBusy("extract");
    setError("");

    try {
      const response = await fetch("/api/ark/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: currentApiKey.trim(),
          model: MODEL,
          transcript: sourceText,
        }),
      });

      const payload = (await response.json()) as { result?: ExtractionResult; error?: string };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "AI 整理失败。");
      }

      setExtraction(payload.result);
      setExtractionSourceType(source);
      setExtractionSourceText(sourceText);
      setStatus("学习点待确认");
      setActiveTab("review");
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "AI 整理失败。");
    } finally {
      setBusy(null);
    }
  }

  async function confirmExtraction() {
    if (!extraction) return;

    setBusy("save");
    setError("");

    try {
      let conversationId: string | null = null;

      if (supabase && userId) {
        conversationId =
          extractionSourceType === "chat" && chatConversationId
            ? chatConversationId
            : await createConversation(extraction.title || "英语对话复盘", extractionSourceType);
        if (conversationId && extractionSourceText.trim()) {
          await saveMessages(conversationId, [
            {
              id: makeId("msg"),
              role: "user",
              content: extractionSourceText.trim(),
              createdAt: nowIso(),
            },
          ]);
        }

        await supabase.from("extraction_runs").insert({
          user_id: userId,
          conversation_id: conversationId,
          model: MODEL,
          input_summary: extractionSourceText.slice(0, 800),
          status: "success",
        });
      }

      const nextItems = reviewItemsFromExtraction(extraction, conversationId ?? undefined);

      if (supabase && userId) {
        const rows = nextItems.map((item) => ({
          user_id: userId,
          conversation_id: conversationId,
          kind: item.kind,
          prompt_cn: item.prompt_cn,
          answer_en: item.answer_en,
          explanation: item.explanation,
          tags: item.tags,
          difficulty: item.difficulty,
          due_at: item.due_at,
        }));

        const { data, error: insertError } = await supabase
          .from("review_items")
          .insert(rows)
          .select("*");

        if (insertError) throw insertError;

        const savedItems = ((data ?? []) as DatabaseReviewItem[]).map(toReviewItem);
        setItems((current) => [...savedItems, ...current]);
        setSelectedItemId(savedItems[0]?.id ?? selectedItemId);
      } else {
        setItems((current) => [...nextItems, ...current]);
        setSelectedItemId(nextItems[0]?.id ?? selectedItemId);
      }

      setExtraction(null);
      setStatus("已加入复习");
      setActiveTab("practice");
      await refreshConversations();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存复习内容失败。");
    } finally {
      setBusy(null);
    }
  }

  async function sendChatMessage() {
    const content = chatInput.trim();
    if (!content) return;

    const localSettings = syncLocalSettings();
    const currentApiKey = localSettings.apiKey || apiKey;

    if (!currentApiKey.trim()) {
      setError("请先在设置里填写火山方舟 API key。");
      setSettingsOpen(true);
      return;
    }

    const userMessage: ChatMessage = {
      id: makeId("msg"),
      role: "user",
      content,
      createdAt: nowIso(),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setChatInput("");
    setBusy("chat");
    setError("");
    if (localSettings.autoReadAssistant) {
      speech.prime();
    }

    try {
      const response = await fetch("/api/ark/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: currentApiKey.trim(),
          model: MODEL,
          messages: nextMessages,
          scene: chatScene,
        }),
      });

      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || !payload.text) {
        throw new Error(payload.error || "AI 对话失败。");
      }

      const assistantMessage: ChatMessage = {
        id: makeId("msg"),
        role: "assistant",
        content: payload.text,
        createdAt: nowIso(),
      };

      const finalMessages = [...nextMessages, assistantMessage];
      setMessages(finalMessages);

      if (localSettings.autoReadAssistant) {
        speech.speak(assistantMessage.content);
      }

      if (supabase && userId) {
        const fallbackTitle = content.slice(0, 18) || "站内英语对话";
        const conversationId = chatConversationId ?? (await createConversation(fallbackTitle, "chat"));
        if (conversationId) {
          setChatConversationId(conversationId);
          await saveMessages(conversationId, [userMessage, assistantMessage]);
          await refreshConversations();
        }
      }
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "AI 对话失败。");
    } finally {
      setBusy(null);
    }
  }

  const rateItem = useCallback(
    async (item: ReviewItem, rating: ReviewRating) => {
      const dueAt = nextDueDate(rating);
      const masteredAt = rating === "mastered" ? nowIso() : null;
      const difficulty = rating === "hard" ? Math.min(item.difficulty + 1, 5) : Math.max(item.difficulty - 1, 1);
      const updatedItems = items.map((candidate) =>
        candidate.id === item.id ? { ...candidate, due_at: dueAt, mastered_at: masteredAt, difficulty } : candidate,
      );
      const nextItem =
        updatedItems.filter(isDue).find((candidate) => candidate.id !== item.id) ??
        updatedItems.find((candidate) => candidate.id !== item.id) ??
        null;

      setItems(updatedItems);
      setSelectedItemId(nextItem?.id ?? null);
      setPracticeFeedback(null);

      if (supabase && userId && !item.id.startsWith("seed_")) {
        await supabase
          .from("review_items")
          .update({ due_at: dueAt, mastered_at: masteredAt, difficulty })
          .eq("id", item.id);

        await supabase.from("review_events").insert({
          user_id: userId,
          review_item_id: item.id,
          rating,
          correct: rating !== "hard",
          duration_ms: null,
        });
      }
    },
    [items, supabase, userId],
  );

  async function evaluatePractice(item: ReviewItem, learnerAnswer: string) {
    const localSettings = syncLocalSettings();
    const currentApiKey = localSettings.apiKey || apiKey;

    if (!currentApiKey.trim()) {
      setError("请先在设置里填写火山方舟 API key。");
      setSettingsOpen(true);
      return;
    }

    if (!learnerAnswer.trim()) {
      setError("请先写下你自己说出的英文，再让 AI 评估。");
      return;
    }

    setBusy("evaluate");
    setError("");
    setPracticeFeedback(null);

    try {
      const response = await fetch("/api/ark/practice-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: currentApiKey.trim(),
          model: MODEL,
          promptCn: practicePrompt(item),
          referenceAnswer: item.answer_en,
          learnerAnswer,
        }),
      });

      const payload = (await response.json()) as { result?: PracticeFeedback; error?: string };
      if (!response.ok || !payload.result) {
        throw new Error(payload.error || "AI 评估失败。");
      }

      setPracticeFeedback(payload.result);
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : "AI 评估失败。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f4f0e8] text-[#191715]">
      <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pb-[calc(6.5rem_+_env(safe-area-inset-bottom))] pt-[calc(1rem_+_env(safe-area-inset-top))] sm:px-6 lg:max-w-5xl">
        <AppHeader
          status={status}
          hasApiKey={Boolean(apiKey.trim())}
          hasSupabase={hasSupabase}
          userId={userId}
          onOpenSettings={() => {
            syncLocalSettings();
            setSettingsOpen(true);
          }}
        />

        {error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <section className="flex min-h-0 flex-1 pt-4">
          {activeTab === "chat" ? (
            <ConversationTab
              messages={messages}
              chatInput={chatInput}
              scene={chatScene}
              scenes={SCENES}
              coaching={coaching}
              onChatInputChange={setChatInput}
              onSceneChange={setChatScene}
              onSendChat={sendChatMessage}
              onRunCoaching={() => runCoaching()}
              onUseCoaching={(value) => setChatInput(value)}
              onAddCoaching={addCoachingToReview}
              onExtractChat={() => runExtraction("chat")}
              onSpeak={speech.speak}
              onPrimeSpeech={speech.prime}
              autoReadAssistant={autoReadAssistant}
              conversations={chatConversations}
              currentConversationId={chatConversationId}
              onNewConversation={startNewConversation}
              onLoadConversation={loadConversation}
              busy={busy}
            />
          ) : null}

          {activeTab === "import" ? (
            <RecordsTab
              conversations={conversations}
              onLoadConversation={loadConversation}
              transcript={transcript}
              onTranscriptChange={setTranscript}
              onExtractPaste={() => runExtraction("paste")}
              busy={busy}
            />
          ) : null}

          {activeTab === "review" ? (
            <ReviewTab
              extraction={extraction}
              busy={busy}
              onConfirm={confirmExtraction}
              items={items}
              dueItems={dueItems}
              selectedId={selectedItem?.id ?? null}
              onSelect={(id) => {
                setSelectedItemId(id);
                setPracticeFeedback(null);
                setActiveTab("practice");
              }}
            />
          ) : null}

          {activeTab === "practice" ? (
            <PracticeTab
              key={selectedItem?.id ?? "empty"}
              item={selectedItem}
              onRate={rateItem}
              onEvaluate={evaluatePractice}
              feedback={practiceFeedback}
              busy={busy}
              speech={speech}
            />
          ) : null}
        </section>
      </div>

      <BottomTabs activeTab={activeTab} onChange={setActiveTab} dueCount={dueItems.length} />

      {settingsOpen ? (
        <SettingsPanel
          apiKey={apiKey}
          onApiKeyChange={saveApiKey}
          autoReadAssistant={autoReadAssistant}
          onAutoReadChange={saveAutoRead}
          speech={speech}
          model={MODEL}
          status={status}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </main>
  );
}

function AppHeader({
  status,
  hasApiKey,
  hasSupabase,
  userId,
  onOpenSettings,
}: {
  status: string;
  hasApiKey: boolean;
  hasSupabase: boolean;
  userId: string | null;
  onOpenSettings: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-[#ddd5c8] pb-4">
      <div>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#191715] text-white">
            <Sparkles size={17} />
          </div>
          <div>
            <h1 className="font-serif text-xl font-semibold leading-5">SpeakLoop</h1>
            <p className="text-xs text-[#746f68]">
              {hasApiKey ? "Ark 已就绪" : "待设置 Key"} · {hasSupabase ? userId?.slice(0, 8) || "连接中" : status}
            </p>
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#ddd5c8] bg-white text-[#191715] shadow-sm"
        aria-label="打开设置"
      >
        <Settings size={18} />
      </button>
    </header>
  );
}

function practicePrompt(item: ReviewItem) {
  if (item.kind !== "issue") return item.prompt_cn;

  const stopPhrases = ["，正确", "。正确", "；正确", ", correct", ". correct"];
  let prompt = item.prompt_cn;

  stopPhrases.forEach((phrase) => {
    const index = prompt.toLowerCase().indexOf(phrase.toLowerCase());
    if (index > 0) prompt = prompt.slice(0, index);
  });

  const adviceIndex = prompt.indexOf("，要避免");
  if (adviceIndex > 0) prompt = prompt.slice(0, adviceIndex);

  return prompt.trim().replace(/[，,。；;：:]+$/u, "") || item.prompt_cn;
}

function ConversationTab({
  messages,
  chatInput,
  scene,
  scenes,
  coaching,
  onChatInputChange,
  onSceneChange,
  onSendChat,
  onRunCoaching,
  onUseCoaching,
  onAddCoaching,
  onExtractChat,
  onSpeak,
  onPrimeSpeech,
  autoReadAssistant,
  conversations,
  currentConversationId,
  onNewConversation,
  onLoadConversation,
  busy,
}: {
  messages: ChatMessage[];
  chatInput: string;
  scene: string;
  scenes: string[];
  coaching: CoachingResult | null;
  onChatInputChange: (value: string) => void;
  onSceneChange: (value: string) => void;
  onSendChat: () => void;
  onRunCoaching: () => void;
  onUseCoaching: (value: string) => void;
  onAddCoaching: (result: CoachingResult) => void;
  onExtractChat: () => void;
  onSpeak: (text: string) => void;
  onPrimeSpeech: () => void;
  autoReadAssistant: boolean;
  conversations: ConversationRecord[];
  currentConversationId: string | null;
  onNewConversation: () => void;
  onLoadConversation: (conversationId: string) => void;
  busy: BusyState;
}) {
  return (
    <section className="flex min-h-[calc(100dvh_-_11rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] w-full flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#746f68]">AI Speaking Room</p>
          <h2 className="mt-1 font-serif text-3xl font-semibold leading-tight">先说出来，再慢慢变好</h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#ddd5c8] bg-white px-3 py-2 text-xs font-medium text-[#746f68]">
          <Volume2 size={14} className="text-[#8f2638]" />
          {autoReadAssistant ? "AI 回复自动朗读" : "自动朗读已关闭"}
        </div>
      </div>

      <div className="mb-3 rounded-lg border border-[#ddd5c8] bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <History size={16} />
            历史对话
          </div>
          <button
            type="button"
            onClick={onNewConversation}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#191715] px-3 text-xs font-semibold text-white"
          >
            <Plus size={14} />
            新对话
          </button>
        </div>
        {conversations.length ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onLoadConversation(conversation.id)}
                className={`shrink-0 rounded-md border px-3 py-2 text-left text-xs ${
                  conversation.id === currentConversationId
                    ? "border-[#5d6b57] bg-[#ebe7df] text-[#191715]"
                    : "border-[#ddd5c8] bg-[#fffdf8] text-[#746f68]"
                }`}
              >
                <span className="block max-w-36 truncate font-semibold">{conversation.title}</span>
                <span>{new Date(conversation.created_at).toLocaleDateString("zh-CN")}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs leading-5 text-[#746f68]">
            还没有历史对话。发出第一条消息后，系统会自动归档到这里。
          </p>
        )}
      </div>

      <div className="mb-3 rounded-lg border border-[#ddd5c8] bg-white p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">场景练习</p>
            <p className="mt-1 text-xs leading-5 text-[#746f68]">选择一个场景，AI 会更像在真实语境里陪你说。</p>
          </div>
          <span className="rounded-full bg-[#ebe7df] px-2 py-1 text-xs font-semibold text-[#5d6b57]">{scene}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {scenes.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => onSceneChange(candidate)}
              className={`shrink-0 rounded-md border px-3 py-2 text-xs font-semibold ${
                candidate === scene ? "border-[#5d6b57] bg-[#ebe7df] text-[#191715]" : "border-[#ddd5c8] bg-[#fffdf8] text-[#746f68]"
              }`}
            >
              {candidate}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-[#ddd5c8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#e8e1d6] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <MessageCircle size={16} />
            对话
          </div>
          <button
            type="button"
            onClick={onExtractChat}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-[#191715] px-3 text-sm font-semibold text-white"
          >
            {busy === "extract" ? <Loader2 className="animate-spin" size={15} /> : <Sparkles size={15} />}
            整理
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-end gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.role === "assistant" ? (
                <button
                  type="button"
                  onClick={() => onSpeak(message.content)}
                  className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f4e7e5] text-[#8f2638]"
                  aria-label="朗读 AI 回复"
                >
                  <Volume2 size={15} />
                </button>
              ) : null}
              <div
                className={`max-w-[82%] rounded-lg px-3 py-2 text-sm leading-6 ${
                  message.role === "user" ? "bg-[#ebe7df] text-[#191715]" : "bg-[#f7f4ed] text-[#302c28]"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {busy === "chat" ? (
            <div className="flex items-center gap-2 rounded-lg bg-[#f7f4ed] px-3 py-2 text-sm text-[#746f68]">
              <Loader2 className="animate-spin" size={15} />
              AI 正在回复...
            </div>
          ) : null}
        </div>

        <div className="border-t border-[#e8e1d6] p-3">
          {coaching ? (
            <section className="mb-3 rounded-lg border border-[#ddd5c8] bg-[#fffdf8] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">表达陪练</p>
                  <p className="mt-1 text-xs leading-5 text-[#746f68]">{coaching.intent_cn}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#ebe7df] px-2 py-1 text-xs font-semibold text-[#5d6b57]">
                  {coaching.scene}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSpeak(coaching.practice_line || coaching.recommended_en)}
                className="w-full rounded-md bg-white px-3 py-2 text-left text-sm font-semibold leading-6 text-[#191715]"
              >
                {coaching.recommended_en}
              </button>
              {coaching.alternatives.length ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {coaching.alternatives.slice(0, 2).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => onSpeak(item)}
                      className="rounded-md border border-[#ddd5c8] bg-white px-3 py-2 text-left text-xs leading-5 text-[#746f68]"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onUseCoaching(coaching.recommended_en)}
                  className="h-9 rounded-md bg-[#191715] px-3 text-xs font-semibold text-white"
                >
                  用这句继续聊
                </button>
                <button
                  type="button"
                  onClick={() => onAddCoaching(coaching)}
                  className="h-9 rounded-md border border-[#ddd5c8] bg-white px-3 text-xs font-semibold text-[#191715]"
                >
                  加入复习
                </button>
              </div>
            </section>
          ) : null}
          <div className="flex gap-2">
            <input
              value={chatInput}
              onChange={(event) => onChatInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onSendChat();
              }}
              placeholder="用英语说一句..."
              className="h-12 min-w-0 flex-1 rounded-md border border-[#ddd5c8] bg-[#fffdf8] px-3 text-base outline-none focus:border-[#5d6b57] focus:ring-2 focus:ring-[#5d6b57]/15 sm:text-sm"
            />
            <button
              type="button"
              onClick={onRunCoaching}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[#ddd5c8] bg-[#fffdf8] px-3 text-sm font-semibold text-[#191715]"
            >
              {busy === "coach" ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              帮我说
            </button>
            <button
              type="button"
              onPointerDown={() => {
                if (autoReadAssistant) onPrimeSpeech();
              }}
              onClick={onSendChat}
              className="inline-flex h-12 min-w-16 items-center justify-center gap-1.5 rounded-md bg-[#8f2638] px-3 text-sm font-semibold text-white sm:min-w-20 sm:gap-2 sm:px-4"
            >
              <Send size={16} />
              Send
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function RecordsTab({
  conversations,
  onLoadConversation,
  transcript,
  onTranscriptChange,
  onExtractPaste,
  busy,
}: {
  conversations: ConversationRecord[];
  onLoadConversation: (conversationId: string) => void;
  transcript: string;
  onTranscriptChange: (value: string) => void;
  onExtractPaste: () => void;
  busy: BusyState;
}) {
  return (
    <section className="grid w-full gap-4">
      <div className="mb-5">
        <p className="text-sm font-medium text-[#746f68]">Records</p>
        <h2 className="mt-1 font-serif text-3xl font-semibold leading-tight">历史记录和导入</h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[#746f68]">
          站内对话和手动粘贴都会沉淀到这里。你可以回看旧记录，也可以导入新的对话生成复习。
        </p>
      </div>

      <section className="rounded-lg border border-[#ddd5c8] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <History size={16} />
          全部记录
        </div>
        {conversations.length ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onLoadConversation(conversation.id)}
                className="rounded-lg border border-[#ddd5c8] bg-[#fffdf8] px-3 py-3 text-left"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full bg-[#ebe7df] px-2 py-1 text-xs font-semibold text-[#5d6b57]">
                    {conversation.source_type === "chat" ? "站内对话" : "手动导入"}
                  </span>
                  <span className="text-xs text-[#746f68]">
                    {new Date(conversation.created_at).toLocaleDateString("zh-CN")}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm font-semibold leading-5">{conversation.title}</p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-[#746f68]">
            还没有历史记录。你可以先在“对话”里聊几句，或在下面粘贴一段旧对话。
          </p>
        )}
      </section>

      <div className="rounded-lg border border-[#ddd5c8] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ClipboardPaste size={16} />
          手动导入
        </div>
        <textarea
          value={transcript}
          onChange={(event) => onTranscriptChange(event.target.value)}
          placeholder="把你和 AI 的英语对话记录粘贴到这里..."
          className="min-h-[min(420px,calc(100dvh_-_18rem))] w-full resize-y rounded-lg border border-[#ddd5c8] bg-[#fffdf8] p-4 text-base leading-6 outline-none focus:border-[#5d6b57] focus:ring-2 focus:ring-[#5d6b57]/15 sm:text-sm"
        />
        <button
          type="button"
          onClick={onExtractPaste}
          className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#5d6b57] px-4 text-sm font-semibold text-white sm:w-auto"
        >
          {busy === "extract" ? <Loader2 className="animate-spin" size={16} /> : <BookOpen size={16} />}
          生成学习点
        </button>
      </div>
    </section>
  );
}

function ReviewTab({
  extraction,
  busy,
  onConfirm,
  items,
  dueItems,
  selectedId,
  onSelect,
}: {
  extraction: ExtractionResult | null;
  busy: BusyState;
  onConfirm: () => void;
  items: ReviewItem[];
  dueItems: ReviewItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="grid w-full gap-4">
      <div>
        <p className="text-sm font-medium text-[#746f68]">Review</p>
        <h2 className="mt-1 font-serif text-3xl font-semibold leading-tight">整理结果和今日队列</h2>
      </div>

      <ExtractionReview extraction={extraction} busy={busy} onConfirm={onConfirm} />
      <ReviewQueue items={items} dueItems={dueItems} selectedId={selectedId} onSelect={onSelect} />
    </section>
  );
}

function ExtractionReview({
  extraction,
  busy,
  onConfirm,
}: {
  extraction: ExtractionResult | null;
  busy: BusyState;
  onConfirm: () => void;
}) {
  if (!extraction) {
    return (
      <section className="rounded-lg border border-dashed border-[#d6ccbf] bg-white/70 p-5 text-sm leading-6 text-[#746f68]">
        暂无待确认的 AI 整理结果。你可以在“对话”页整理当前聊天，或在“导入”页粘贴历史记录。
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-[#ddd5c8] bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold">{extraction.title}</h3>
          <p className="mt-1 text-sm text-[#746f68]">确认后加入复习队列。</p>
        </div>
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-[#5d6b57] px-4 text-sm font-semibold text-white"
        >
          {busy === "save" ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
          加入复习
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ResultColumn title="表达问题" items={extraction.issues.map((item) => `${item.original} -> ${item.better}`)} />
        <ResultColumn title="重点词汇" items={extraction.vocabulary.map((item) => `${item.term}: ${item.meaning_cn}`)} />
        <ResultColumn title="跟读句子" items={extraction.sentences.map((item) => item.answer_en)} />
      </div>
    </section>
  );
}

function ResultColumn({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-[#ddd5c8] bg-[#fffdf8] p-3">
      <h4 className="mb-2 text-sm font-semibold">{title}</h4>
      <div className="space-y-2 text-sm leading-6 text-[#746f68]">
        {items.slice(0, 5).map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </div>
  );
}

function ReviewQueue({
  items,
  dueItems,
  selectedId,
  onSelect,
}: {
  items: ReviewItem[];
  dueItems: ReviewItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const visibleItems = dueItems.length ? dueItems : items;

  return (
    <section className="rounded-lg border border-[#ddd5c8] bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold">今日复习</h3>
          <p className="mt-1 text-sm text-[#746f68]">
            {dueItems.length} 个到期，全部 {items.length} 个条目
          </p>
        </div>
        <RefreshCw size={18} className="text-[#746f68]" />
      </div>

      <div className="grid gap-2">
        {visibleItems.slice(0, 20).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`rounded-lg border px-3 py-3 text-left ${
              item.id === selectedId ? "border-[#5d6b57] bg-[#ebe7df]" : "border-[#ddd5c8] bg-[#fffdf8]"
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase text-[#746f68]">{item.kind}</span>
              <span className="text-xs text-[#746f68]">难度 {item.difficulty}</span>
            </div>
            <p className="text-sm font-semibold leading-5">{practicePrompt(item)}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function PracticeTab({
  item,
  onRate,
  onEvaluate,
  feedback,
  busy,
  speech,
}: {
  item: ReviewItem | null;
  onRate: (item: ReviewItem, rating: ReviewRating) => Promise<void>;
  onEvaluate: (item: ReviewItem, learnerAnswer: string) => Promise<void>;
  feedback: PracticeFeedback | null;
  busy: BusyState;
  speech: SpeechState;
}) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [draft, setDraft] = useState("");

  if (!item) {
    return (
      <section className="w-full rounded-lg border border-[#ddd5c8] bg-white p-5 text-sm text-[#746f68]">
        还没有复习内容。先导入一段对话，或在对话页和 AI 聊几句。
      </section>
    );
  }

  return (
    <section className="w-full">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[#746f68]">Practice</p>
          <h2 className="mt-1 font-serif text-3xl font-semibold leading-tight">一张卡片，一次练熟</h2>
        </div>
        <button
          type="button"
          onClick={() => speech.speak(item.answer_en)}
          disabled={!showAnswer}
          className={`flex h-11 w-11 items-center justify-center rounded-lg text-white ${
            showAnswer ? "bg-[#8f2638]" : "bg-[#c9c0b5] opacity-60"
          }`}
          aria-label={showAnswer ? "朗读答案" : "显示答案后可朗读"}
        >
          <Volume2 size={18} />
        </button>
      </div>

      <div className="rounded-lg border border-[#ddd5c8] bg-white p-3 shadow-sm sm:p-4">
        <div className="rounded-lg bg-[#171512] p-4 text-white sm:p-5">
          <div className="mb-3 flex flex-wrap gap-2 sm:mb-4">
            {item.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/75">
                {tag}
              </span>
            ))}
          </div>
          <p className="text-xl font-semibold leading-snug sm:text-2xl">{practicePrompt(item)}</p>
          {showAnswer ? (
            <div className="mt-4 rounded-lg bg-white/10 p-4">
              <p className="text-base leading-7 sm:text-lg sm:leading-8">{item.answer_en}</p>
              <p className="mt-3 text-sm leading-6 text-white/70">{item.explanation}</p>
            </div>
          ) : null}
        </div>

        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="写下你自己说出的英文..."
          className="mt-3 min-h-24 w-full resize-y rounded-lg border border-[#ddd5c8] bg-[#fffdf8] p-3 text-base leading-6 outline-none focus:border-[#5d6b57] sm:mt-4 sm:min-h-28 sm:text-sm"
        />

        <div className="mt-3 grid gap-2 sm:mt-4">
          <button
            type="button"
            onClick={() => onEvaluate(item, draft)}
            disabled={busy === "evaluate"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#5d6b57] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === "evaluate" ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
            AI 评估我的表达
          </button>
          <button
            type="button"
            onClick={() => setShowAnswer((current) => !current)}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#191715] px-4 text-sm font-semibold text-white"
          >
            {showAnswer ? "隐藏答案" : "显示答案"}
          </button>
          <div className="grid grid-cols-3 gap-2">
            <RatingButton label="Hard" onClick={() => onRate(item, "hard")} />
            <RatingButton label="Easy" onClick={() => onRate(item, "easy")} />
            <RatingButton label="Mastered" onClick={() => onRate(item, "mastered")} />
          </div>
        </div>

        {feedback ? (
          <section className="mt-4 rounded-lg border border-[#ddd5c8] bg-[#fffdf8] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <Sparkles size={16} className="text-[#8f2638]" />
              AI 评估
            </div>
            <p className="text-sm leading-6 text-[#302c28]">{feedback.summary}</p>
            {feedback.gap ? <p className="mt-2 text-sm leading-6 text-[#746f68]">{feedback.gap}</p> : null}
            {feedback.suggestions.length ? (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase text-[#746f68]">改进建议</p>
                <div className="mt-2 grid gap-2">
                  {feedback.suggestions.map((suggestion) => (
                    <p key={suggestion} className="rounded-md bg-white px-3 py-2 text-sm leading-6 text-[#302c28]">
                      {suggestion}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {feedback.alternatives.length ? (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase text-[#746f68]">相同含义的表达</p>
                <div className="mt-2 grid gap-2">
                  {feedback.alternatives.map((alternative) => (
                    <button
                      key={alternative}
                      type="button"
                      onClick={() => speech.speak(alternative)}
                      className="rounded-md border border-[#ddd5c8] bg-white px-3 py-2 text-left text-sm leading-6 text-[#302c28]"
                    >
                      {alternative}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </section>
  );
}

function RatingButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center rounded-md border border-[#ddd5c8] bg-[#fffdf8] px-4 text-sm font-semibold text-[#191715]"
    >
      {label}
    </button>
  );
}

function BottomTabs({
  activeTab,
  onChange,
  dueCount,
}: {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
  dueCount: number;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#ddd5c8] bg-white/95 px-3 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))] pt-2 shadow-[0_-10px_30px_rgba(20,32,25,0.08)] backdrop-blur">
      <div className="mx-auto grid max-w-3xl grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onChange(tab.key)}
              className={`relative flex h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-semibold ${
                active ? "bg-[#eee8df] text-[#5d6b57]" : "text-[#746f68]"
              }`}
            >
              <Icon size={18} />
              {tab.label}
              {tab.key === "review" && dueCount > 0 ? (
                <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-[#8f2638]" />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function SettingsPanel({
  apiKey,
  onApiKeyChange,
  autoReadAssistant,
  onAutoReadChange,
  speech,
  model,
  status,
  onClose,
}: {
  apiKey: string;
  onApiKeyChange: (value: string) => void;
  autoReadAssistant: boolean;
  onAutoReadChange: (value: boolean) => void;
  speech: SpeechState;
  model: string;
  status: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#191715]/35 px-4 py-[calc(1.25rem_+_env(safe-area-inset-top))] backdrop-blur-sm" role="dialog" aria-modal="true">
      <section className="mx-auto max-h-[calc(100dvh_-_2.5rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] max-w-lg overflow-y-auto rounded-lg border border-[#ddd5c8] bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">设置</h2>
            <p className="mt-1 text-sm text-[#746f68]">Key 只保存在本地浏览器。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#ddd5c8] bg-[#fffdf8]"
            aria-label="关闭设置"
          >
            <X size={17} />
          </button>
        </div>

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold" htmlFor="api-key">
            <span className="flex items-center gap-2">
              <KeyRound size={16} />
              火山方舟 API key
            </span>
            <input
              id="api-key"
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              type="password"
              placeholder="ark-..."
              className="h-11 rounded-md border border-[#ddd5c8] bg-[#fffdf8] px-3 text-base outline-none focus:border-[#5d6b57] focus:ring-2 focus:ring-[#5d6b57]/15 sm:text-sm"
            />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-[#ddd5c8] bg-[#fffdf8] px-3 py-3 text-sm">
            <span>
              <span className="block font-semibold">AI 回复自动朗读</span>
              <span className="text-xs text-[#746f68]">打开后，AI 新回复会自动播放。</span>
            </span>
            <input
              type="checkbox"
              checked={autoReadAssistant}
              onChange={(event) => onAutoReadChange(event.target.checked)}
              className="h-5 w-5 accent-[#5d6b57]"
            />
          </label>

          <VoiceSettings speech={speech} />

          <div className="rounded-lg bg-[#f7f4ed] p-3 text-xs leading-6 text-[#746f68]">
            <p>模型：{model}</p>
            <p>状态：{status}</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function VoiceSettings({ speech }: { speech: SpeechState }) {
  return (
    <div className="grid gap-3 rounded-lg border border-[#ddd5c8] bg-[#fffdf8] p-3">
      <label className="grid gap-2 text-sm font-semibold" htmlFor="voice-select">
        英文音色
        <select
          id="voice-select"
          value={speech.voiceURI}
          onChange={(event) => speech.setVoiceURI(event.target.value)}
          className="h-10 rounded-md border border-[#ddd5c8] bg-white px-2 text-sm"
        >
          {speech.voices.length ? (
            speech.voices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
              </option>
            ))
          ) : (
            <option value="">无英文音色</option>
          )}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-semibold" htmlFor="voice-rate">
        语速 {speech.rate.toFixed(2)}x
        <input
          id="voice-rate"
          type="range"
          min="0.65"
          max="1.05"
          step="0.05"
          value={speech.rate}
          onChange={(event) => speech.setRate(Number(event.target.value))}
          className="w-full"
        />
      </label>
    </div>
  );
}

type SpeechState = {
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  rate: number;
  setVoiceURI: (value: string) => void;
  setRate: (value: number) => void;
  speak: (text: string) => void;
  prime: () => void;
};

function useSpeech(): SpeechState {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURIState] = useState("");
  const [rate, setRateState] = useState(DEFAULT_VOICE_RATE);

  useEffect(() => {
    function loadVoices() {
      const savedVoiceURI = localStorage.getItem("voiceURI") || "";
      const savedRateValue = localStorage.getItem("voiceRate");
      const savedRate = savedRateValue ? Number(savedRateValue) : DEFAULT_VOICE_RATE;
      const nextVoices = window.speechSynthesis
        .getVoices()
        .filter((voice) => voice.lang.toLowerCase().startsWith("en"))
        .sort((a, b) => scoreVoice(b) - scoreVoice(a));
      const defaultVoice = nextVoices.find((voice) => voice.name.toLowerCase() === DEFAULT_VOICE_NAME);

      setVoices(nextVoices);
      setVoiceURIState((current) => current || savedVoiceURI || defaultVoice?.voiceURI || nextVoices[0]?.voiceURI || "");
      setRateState((current) => {
        if (!Number.isFinite(savedRate) || current !== DEFAULT_VOICE_RATE) return current;
        return savedRate;
      });
    }

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const setVoiceURI = useCallback((value: string) => {
    setVoiceURIState(value);
    localStorage.setItem("voiceURI", value);
  }, []);

  const setRate = useCallback((value: number) => {
    setRateState(value);
    localStorage.setItem("voiceRate", String(value));
  }, []);

  const prime = useCallback(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.resume();
    const utterance = new SpeechSynthesisUtterance(".");
    const voice = voices.find((candidate) => candidate.voiceURI === voiceURI);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-US";
    }
    utterance.rate = rate;
    utterance.volume = 0.01;
    window.speechSynthesis.speak(utterance);
    window.setTimeout(() => {
      if (!window.speechSynthesis.speaking) return;
      window.speechSynthesis.cancel();
    }, 80);
  }, [rate, voiceURI, voices]);

  const speak = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = voices.find((candidate) => candidate.voiceURI === voiceURI);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      } else {
        utterance.lang = "en-US";
      }
      utterance.rate = rate;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    },
    [rate, voiceURI, voices],
  );

  return {
    voices,
    voiceURI,
    rate,
    setVoiceURI,
    setRate,
    speak,
    prime,
  };
}

function scoreVoice(voice: SpeechSynthesisVoice) {
  const name = voice.name.toLowerCase();
  let score = voice.lang.toLowerCase() === "en-us" ? 50 : 20;
  if (name === DEFAULT_VOICE_NAME) score += 100;
  if (name.includes("google") && voice.lang.toLowerCase() === "en-us") score += 60;
  ["samantha", "ava", "allison", "jenny", "aria", "natural", "premium", "enhanced"].forEach((keyword, index) => {
    if (name.includes(keyword)) score += 30 - index;
  });
  ["compact", "novelty", "whisper", "zarvox", "bells", "boing"].forEach((keyword) => {
    if (name.includes(keyword)) score -= 80;
  });
  return score;
}
