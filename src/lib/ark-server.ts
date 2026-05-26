import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { modelName } from "@/lib/ark";

export class ApiRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

type AuthenticatedRequest = {
  userId: string;
  supabase: SupabaseClient;
};

type UsageEvent = {
  route: string;
  model?: string;
  inputChars?: number;
  outputChars?: number;
  status: "success" | "error";
  errorMessage?: string;
};

export function getArkApiKey() {
  const apiKey = process.env.ARK_API_KEY?.trim();
  if (!apiKey) {
    throw new ApiRequestError("服务端模型未配置。请在环境变量中设置 ARK_API_KEY。", 503);
  }
  return apiKey;
}

export async function getAuthenticatedUserFromRequest(request: Request): Promise<AuthenticatedRequest> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new ApiRequestError("学习空间未配置。请设置 Supabase 环境变量。", 503);
  }

  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    throw new ApiRequestError("请先进入学习空间后再使用 AI。", 401);
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new ApiRequestError("登录状态已失效，请刷新页面后重试。", 401);
  }

  return { userId: data.user.id, supabase };
}

export async function recordAiUsage(auth: AuthenticatedRequest | null, event: UsageEvent) {
  if (!auth) return;

  try {
    await auth.supabase.from("ai_usage_events").insert({
      user_id: auth.userId,
      route: event.route,
      model: modelName(event.model),
      input_chars: event.inputChars ?? 0,
      output_chars: event.outputChars ?? 0,
      status: event.status,
      error_message: event.errorMessage?.slice(0, 500) ?? null,
    });
  } catch {
    // Usage logging should never block the learner's AI flow.
  }
}

export function jsonError(error: unknown, fallback: string) {
  const status = error instanceof ApiRequestError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status });
}

function extractBearerToken(value: string | null) {
  if (!value) return "";
  const [scheme, token] = value.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return "";
  return token?.trim() ?? "";
}
