import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ⚠️ 防御性初始化：supabaseUrl 或 supabaseAnonKey 为空时
// createClient 会直接抛出 "supabaseUrl is required" 导致整个 App 崩溃（白屏）。
// 本 App 主功能依赖本地 localStorage，Supabase 仅用于激活码验证，
// 允许降级运行：无网络/无配置时只有激活码功能不可用。
const _url = supabaseUrl || 'https://placeholder.supabase.co';
const _key = supabaseAnonKey || 'placeholder-anon-key';

export const supabase = createClient(_url, _key);
            