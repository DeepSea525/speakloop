# SpeakLoop

把真实英语对话整理成可复习的单词、短语、句子和表达纠错队列。抖音试用版使用服务端统一 Ark API key，用户打开网站后只需要设置昵称即可开始试用。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

在 `.env.local` 中填入 Supabase 项目的公开配置，以及服务端 Ark key：

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ARK_API_KEY=...
```

`ARK_API_KEY` 只能放在服务端环境变量中，不要加 `NEXT_PUBLIC_`，也不要写入代码。

## 部署与密钥安全

- 火山方舟 API key 只配置为本地 `.env.local` 或 Vercel server-side 环境变量：`ARK_API_KEY`。
- 不要在任何 `NEXT_PUBLIC_` 变量里放 Ark key、Supabase `service_role` 或其他服务端密钥。
- 线上用户不需要填写 API key；前端不会保存、发送或展示用户自己的 Ark key。
- Supabase URL 和 anon key 是公开客户端配置，可以使用 `NEXT_PUBLIC_`：

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

- 如果缺少 Supabase 环境变量，应用会显示配置提示，不再进入演示模式。
- 如果缺少 `ARK_API_KEY`，AI 接口会返回“服务端模型未配置”。

## Supabase

1. 在 Supabase Auth 中启用 Anonymous Sign-ins。
2. 按顺序执行 `supabase/migrations/001_init.sql` 和 `supabase/migrations/002_trial_profiles_usage.sql`。
3. 确认 RLS 已启用。所有业务表通过 `auth.uid() = user_id` 隔离匿名用户数据。
4. `profiles` 保存试用昵称，`ai_usage_events` 记录 AI 调用日志，不保存 Ark key 或 Authorization token。

## Vercel 上线 Checklist

1. 在 Vercel Project Settings 中配置：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ARK_API_KEY`
2. 在火山方舟后台给该 key 设置预算或额度上限。
3. 部署后用一个新浏览器访问线上域名，确认会出现昵称设置弹窗。
4. 完成一轮：设置昵称 -> AI 对话 -> 整理学习点 -> 加入复习 -> AI 评估。

## MVP 功能

- 粘贴英语对话记录并调用火山方舟整理学习点。
- 在站内和 AI 英语对话，并将聊天内容整理成复习条目。
- 首次访问通过 Supabase 匿名登录创建独立用户，昵称用于区分试用记录。
- 复习队列支持 `hard / easy / mastered` 三种轻量间隔复习反馈。
- 练习卡片支持系统英文音色朗读和语速调整。
