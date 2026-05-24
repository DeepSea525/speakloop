# English Review MVP

把英语对话记录整理成可复习的单词、短语、句子和表达纠错队列。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

在 `.env.local` 中填入 Supabase 项目的公开配置：

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

火山方舟 API key 由用户在网页中填写，只保存在当前浏览器的 `localStorage`，不会写入 Supabase。

## 部署与密钥安全

- 不要把火山方舟 API key 写入代码、GitHub、Vercel 环境变量或 Supabase。
- 线上用户需要在网页设置里填写自己的 Ark API key，key 只保存在该用户浏览器本地。
- 如果线上部署时不配置 Supabase 环境变量，应用会进入演示模式，不持久化聊天和复习数据。
- 如果要在线上持久化数据，只配置 Supabase 的公开 URL 和 publishable/anon key：

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

- 不要在任何 `NEXT_PUBLIC_` 变量里放 `service_role` 或其他服务端密钥。

## Supabase

1. 在 Supabase Auth 中启用 Anonymous Sign-ins。
2. 执行 `supabase/migrations/001_init.sql`。
3. 确认 RLS 已启用。所有业务表通过 `auth.uid() = user_id` 隔离匿名用户数据。

## MVP 功能

- 粘贴英语对话记录并调用火山方舟整理学习点。
- 在站内和 AI 英语对话，并将聊天内容整理成复习条目。
- 复习队列支持 `hard / easy / mastered` 三种轻量间隔复习反馈。
- 练习卡片支持系统英文音色朗读和语速调整。
