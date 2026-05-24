<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This project uses Next.js 16 with React 19. APIs, conventions, compiler rules,
and generated route/type behavior may differ from older Next.js projects. When
touching App Router, route handlers, build behavior, or React effects, verify
against the installed package/docs instead of relying on older assumptions.
<!-- END:nextjs-agent-rules -->

# Agent Guide

## Product Intent

This is an MVP for turning real English conversations into a daily review
workflow:

1. Users paste an AI/English conversation transcript, or chat with AI in-app.
2. Ark/Doubao extracts expression issues, vocabulary, and practice sentences.
3. Users confirm extracted items into a review queue.
4. Users practice with Chinese prompts, reveal English answers, listen with
   browser speech synthesis, and mark items `hard`, `easy`, or `mastered`.

Keep the app practical and learning-focused. Do not turn it into a generic AI
chatbot or a marketing landing page.

## Architecture

- Framework: Next.js App Router, TypeScript, Tailwind CSS v4.
- Main UI: `src/components/EnglishReviewApp.tsx`.
- Page entry: `src/app/page.tsx`.
- Ark proxy routes:
  - `src/app/api/ark/chat/route.ts`
  - `src/app/api/ark/extract/route.ts`
- Ark prompt/response helpers: `src/lib/ark.ts`.
- Review scheduling helpers: `src/lib/review.ts`.
- Shared types: `src/lib/types.ts`.
- Supabase browser client: `src/lib/supabase.ts`.
- Database schema and RLS: `supabase/migrations/001_init.sql`.

## Security Rules

- Never commit or hardcode Ark API keys. Treat any pasted key as leaked.
- User Ark API keys are BYOK and must stay in browser `localStorage`; do not
  write them to Supabase, logs, migrations, server env examples, or fixtures.
- API routes may receive the key in a request body and forward it to Ark, but
  must not echo it back or log it.
- Supabase uses anonymous auth for the MVP. Every business table must keep a
  `user_id` column and RLS must isolate rows with `auth.uid() = user_id`.
- Do not disable RLS to "make things work".

## Data Model

The Supabase migration defines:

- `conversations`: imported transcript or in-app chat session.
- `messages`: user/assistant messages within a conversation.
- `extraction_runs`: model extraction attempts and status.
- `review_items`: words, phrases, sentences, and expression rewrites.
- `review_events`: each review rating event.

The lightweight review rule is intentionally simple:

- `hard`: next review in 1 day.
- `easy`: next review in 3 days.
- `mastered`: next review in 14 days and hidden from today's queue.

Do not introduce Anki/FSRS-style scheduling unless explicitly requested.

## Development

Use npm; this project was scaffolded with npm.

```bash
npm install
npm run dev
npm run lint
npm run build
```

Local configuration:

```bash
cp .env.example .env.local
```

Required Supabase public variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

If Supabase variables are missing, the app intentionally falls back to demo
review items and should still render.

## UI Guidelines

- Keep the first screen as the usable product surface, not a landing page.
- Preserve mobile friendliness; the app must work on narrow screens.
- Use browser `speechSynthesis` for reading practice. Do not add paid TTS for
  this MVP unless explicitly requested.
- Avoid bloated UI abstractions. This is still a focused MVP.
- Prefer short Chinese UI copy and clear learning actions.

## Implementation Notes

- React effects are checked strictly by the React compiler lint rules. Avoid
  synchronous `setState` inside effects when an initializer or component `key`
  can express the same state reset.
- Keep browser-only APIs inside client components and guarded by `typeof window`
  when used in state initializers.
- Do not initialize service clients at module scope on the server. The current
  Supabase client is browser-only and returns `null` when public env vars are
  absent.
- Ark extraction expects JSON. If changing prompts, keep
  `parseExtractionJson()` and the UI result shape in sync.

## Verification Checklist

Before handing off meaningful changes:

- Run `npm run lint`.
- Run `npm run build`.
- Start the dev server and verify the main flow in browser:
  - page loads without console errors,
  - paste/chat sections render,
  - missing Ark key produces a clear error,
  - practice card can reveal an answer,
  - `hard/easy/mastered` updates the queue,
  - mobile viewport does not clip primary controls.
- Search for leaked keys before final handoff:

```bash
rg -n "ark-[A-Za-z0-9-]+|Authorization: Bearer|Bearer [A-Za-z0-9._-]{20,}" .
```

The search should return no committed secrets.
