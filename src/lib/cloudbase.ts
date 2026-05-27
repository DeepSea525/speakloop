import cloudbase from "@cloudbase/js-sdk";

const envId = process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID || "speakloop-d0gycd2krc8b125e9";

// 初始化云开发
export const app = cloudbase.init({
  env: envId,
});

// 认证模块
export const auth = app.auth({
  persistence: "local",
});

// 数据库模块
export const db = app.database();

// 云函数调用
export async function callFunction(name: string, data?: Record<string, unknown>) {
  const result = await app.callFunction({
    name,
    data,
  });
  return result.result;
}

// 匿名登录
export async function signInAnonymously() {
  const loginState = await auth.getLoginState();
  if (loginState) {
    return loginState;
  }
  await auth.anonymousAuthProvider().signIn();
  return auth.getLoginState();
}

// 获取当前用户ID
export async function getCurrentUserId(): Promise<string | null> {
  const loginState = await auth.getLoginState();
  return loginState?.user?.uid || null;
}

// 检查登录状态
export async function checkLoginState() {
  return auth.getLoginState();
}
