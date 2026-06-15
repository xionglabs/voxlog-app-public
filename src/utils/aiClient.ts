/**
 * 统一 AI 调用入口
 *
 * 路由策略：
 *   - Gemini key（AIza 开头）→ 浏览器端直调 Google Gemini API（native 格式）
 *     原因：Supabase 服务器网络无法访问 Google 域名
 *   - NVIDIA key（nvapi- 开头）→ 走 Supabase Edge Function
 *     原因：NVIDIA API 不支持浏览器 CORS，桌面应用（Cherry Studio）不受此限制
 *   - 其他（sk- 等）→ 走 Supabase Edge Function
 */

import { supabase } from '@/db/supabase'

// ── 类型 ──────────────────────────────────────────────
interface AiConfig {
  customApiKey?: string
  customBaseUrl?: string
  customModel?: string
}

interface AiOrganizeParams extends AiConfig {
  transcript: string
  existingContent?: string
  date: string
}

interface AiSummaryParams extends AiConfig {
  period: string
  diaries: { date: string; content: string }[]
}

// ── Provider 检测 ─────────────────────────────────────
export function isGeminiKey(apiKey: string): boolean {
  return apiKey.startsWith('AIza')
}

export function isNvidiaKey(apiKey: string): boolean {
  return apiKey.startsWith('nvapi-')
}

/** 判断是否需要浏览器直调（绕过服务器）— 目前仅 Gemini */
function isBrowserDirectKey(apiKey: string): boolean {
  return isGeminiKey(apiKey)
}

function resolveGeminiBaseUrl(baseUrl?: string): string {
  if (!baseUrl || baseUrl === 'https://api.openai.com/v1') {
    return 'https://generativelanguage.googleapis.com/v1beta'
  }
  return baseUrl.replace(/\/$/, '')
}

function resolveNvidiaBaseUrl(baseUrl?: string): string {
  if (!baseUrl || baseUrl === 'https://api.openai.com/v1') {
    return 'https://integrate.api.nvidia.com/v1'
  }
  return baseUrl.replace(/\/$/, '')
}

function resolveModel(apiKey: string, customModel?: string): string {
  if (customModel?.trim()) return customModel.trim()
  if (isGeminiKey(apiKey)) return 'gemini-2.0-flash'
  // 8B 小模型：速度快（10-20s），不超时；nemotron-70b 太慢会超 Edge Function 60s
  if (isNvidiaKey(apiKey)) return 'meta/llama-3.1-8b-instruct'
  return 'gpt-4o-mini'
}

// Gemini 浏览器端直调（绕过服务器网络限制）
async function callGeminiBrowser(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  maxTokens = 2000,
  retryCount = 0,
): Promise<string> {
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  })
  if (!res.ok) {
    const errText = await res.text()

    // 解析 Gemini 标准错误格式，给出可读提示
    let friendlyMsg = errText
    try {
      const errJson = JSON.parse(errText)
      const rawMsg: string = errJson?.error?.message || errText
      if (res.status === 429) {
        // 第1次重试：等 3s；第2次重试：等 10s；第3次：等 62s（跨过下一分钟窗口）
        const delays = [3000, 10000, 62000]
        if (retryCount < delays.length) {
          await new Promise(r => setTimeout(r, delays[retryCount]))
          return callGeminiBrowser(apiKey, baseUrl, model, prompt, maxTokens, retryCount + 1)
        }
        friendlyMsg = `Gemini 速率限制（免费版每分钟限 15 次），已自动重试 ${delays.length} 次仍失败，请稍等几秒后再试`
      } else if (res.status === 400) {
        friendlyMsg = `请求参数错误：${rawMsg}`
      } else if (res.status === 403) {
        friendlyMsg = `API Key 无权访问此模型（${rawMsg}）`
      } else if (res.status === 404) {
        friendlyMsg = `模型不存在，请检查模型名称：${model}`
      } else {
        friendlyMsg = rawMsg
      }
    } catch {
      // JSON 解析失败时同样处理 429
      if (res.status === 429) {
        const delays = [3000, 10000, 62000]
        if (retryCount < delays.length) {
          await new Promise(r => setTimeout(r, delays[retryCount]))
          return callGeminiBrowser(apiKey, baseUrl, model, prompt, maxTokens, retryCount + 1)
        }
      }
    }
    throw new Error(friendlyMsg)
  }
  const data = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
  if (!text) throw new Error('Gemini 返回内容为空')
  return text
}

// OpenAI 兼容浏览器端直调（NVIDIA NIM 等支持 CORS 的 provider）
async function callOpenAICompatBrowser(
  apiKey: string,
  baseUrl: string,
  model: string,
  prompt: string,
  maxTokens = 2000,
): Promise<string> {
  const url = `${baseUrl}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.7,
    }),
  })
  if (!res.ok) {
    const errText = await res.text()
    let friendlyMsg = errText
    try {
      const errJson = JSON.parse(errText)
      const rawMsg: string = errJson?.error?.message || errText
      if (res.status === 401 || res.status === 403) {
        friendlyMsg = `API Key 无效或无权限：${rawMsg}`
      } else if (res.status === 429) {
        friendlyMsg = `请求过于频繁，请稍等片刻后重试`
      } else if (res.status === 404) {
        friendlyMsg = `模型不存在，请检查模型名称：${model}`
      } else {
        friendlyMsg = rawMsg
      }
    } catch { /* 保留原始文本 */ }
    throw new Error(friendlyMsg)
  }
  const data = await res.json()
  const text: string = data?.choices?.[0]?.message?.content || ''
  if (!text) throw new Error('AI 返回内容为空')
  return text
}

// OpenAI 兼容走 Supabase Edge Function（其他 provider）
async function callEdgeFunction(action: string, body: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.functions.invoke('diary-ai', { body: { action, ...body } })
  if (error) {
    const errMsg = await error?.context?.text?.()
    throw new Error(errMsg || error.message)
  }
  const result: string = data?.result || ''
  if (!result) throw new Error('AI 返回内容为空')
  return result
}

// ── 验证 Key ──────────────────────────────────────────
export async function verifyApiKey(cfg: AiConfig): Promise<{ provider: string; model: string }> {
  const key = cfg.customApiKey?.trim() || ''
  if (!key) throw new Error('请先填写 API Key')

  if (isGeminiKey(key)) {
    const base = resolveGeminiBaseUrl(cfg.customBaseUrl)
    const model = resolveModel(key, cfg.customModel)
    const res = await fetch(`${base}/models?key=${key}`)
    if (!res.ok) {
      const errText = await res.text()
      let friendlyMsg = errText
      try {
        const errJson = JSON.parse(errText)
        const rawMsg: string = errJson?.error?.message || errText
        if (res.status === 400 || res.status === 401 || res.status === 403) {
          friendlyMsg = `API Key 无效或无权限：${rawMsg}`
        } else if (res.status === 429) {
          friendlyMsg = `请求过于频繁，请稍等片刻后重试`
        } else {
          friendlyMsg = rawMsg
        }
      } catch { /* 保留原始文本 */ }
      throw new Error(friendlyMsg)
    }
    return { provider: 'Gemini', model }
  }

  if (isNvidiaKey(key)) {
    // NVIDIA 不支持浏览器 CORS，走 Edge Function 验证
    const model = resolveModel(key, cfg.customModel)
    const baseUrl = resolveNvidiaBaseUrl(cfg.customBaseUrl)
    await callEdgeFunction('test', {
      customApiKey: key,
      customBaseUrl: baseUrl,
      customModel: model,
    })
    return { provider: 'NVIDIA NIM', model }
  }

  // 其他 OpenAI 兼容 provider → Edge Function
  const model = resolveModel(key, cfg.customModel)
  await callEdgeFunction('test', {
    customApiKey: key,
    customBaseUrl: cfg.customBaseUrl || undefined,
    customModel: cfg.customModel || undefined,
  })
  return { provider: 'OpenAI 兼容', model }
}

// ── AI 整理口述 ───────────────────────────────────────
export async function aiOrganize(params: AiOrganizeParams): Promise<string> {
  const key = params.customApiKey?.trim() || ''

  const prompt = params.existingContent
    ? `你是一个专业的日记整理助手。用户已有当天的日记内容，现在有新的口述内容，请将两部分内容合并整理成完整的日记。

当天已有日记：
${params.existingContent}

新的口述内容：
${params.transcript}

请将以上内容合并整理，输出格式如下（严格按此格式，保留所有原有信息，补充新内容）：
【日期】${params.date}
【天气】
【今日记录】
（合并整理今日主要事件和经历）
【每日新知】
（提炼今天学到的知识或新发现，若无则留空）
【今日备忘】
（整理待办或需要记住的事项，若无则留空）

直接输出日记内容，不要添加任何解释或前缀。`
    : `你是一个专业的日记整理助手。请将以下口述内容整理成标准日记格式。

口述内容：
${params.transcript}

请输出格式如下（严格按此格式）：
【日期】${params.date}
【天气】
【今日记录】
（整理今日主要事件和经历）
【每日新知】
（提炼今天学到的知识或新发现，若无则留空）
【今日备忘】
（整理待办或需要记住的事项，若无则留空）

直接输出日记内容，不要添加任何解释或前缀。`

  if (key && isGeminiKey(key)) {
    const base = resolveGeminiBaseUrl(params.customBaseUrl)
    const model = resolveModel(key, params.customModel)
    return callGeminiBrowser(key, base, model, prompt)
  }

  // NVIDIA 及其他 OpenAI 兼容 provider → Edge Function（服务器端无 CORS 限制）
  const effectiveBaseUrl = (key && isNvidiaKey(key))
    ? resolveNvidiaBaseUrl(params.customBaseUrl)
    : (params.customBaseUrl || undefined)

  return callEdgeFunction('organize', {
    transcript: params.transcript,
    existingContent: params.existingContent || '',
    date: params.date,
    customApiKey: key || undefined,
    customBaseUrl: effectiveBaseUrl,
    customModel: params.customModel || resolveModel(key, params.customModel) || undefined,
  })
}

// ── AI 总结 ───────────────────────────────────────────
export function buildSummaryPrompt(period: string, diaries: { date: string; content: string }[]): string {
  const periodMap: Record<string, string> = { week: '周', month: '月', year: '年' }
  const periodName = periodMap[period] || '周'
  // 截断每篇至 500 字（月/年日记多，保留更多上下文）
  const diaryTexts = diaries
    .map(d => {
      const body = d.content.length > 500 ? d.content.slice(0, 500) + '…' : d.content
      return `[${d.date}]\n${body}`
    })
    .join('\n\n---\n\n')

  return `你是一位有洞察力的个人成长教练。请深度阅读以下${periodName}日记，生成一份真诚、有价值的个人复盘报告。

日记内容：
${diaryTexts}

请严格按以下 Markdown 格式输出，6个章节，每节都要有实质内容（不要流于形式，不要空话套话）：

## 🎯 关键词
（3个词精准概括这${periodName}的状态，用 | 分隔，例如：专注 | 突破 | 疲惫）

## 📅 重要时刻
（精选这${periodName}最值得铭记的 2-4 件事，每条一行，用 - 开头，简洁有力）

## 💡 知识与收获
（汇总从【每日新知】等内容中提炼的知识、技能或认知收获，分条列出）

## ✅ 行动复盘
（梳理这${periodName}计划与行动的完成情况，指出做到了什么、哪里还可以改进）

## 🌱 成长洞见
（对这${periodName}最重要的一个深度洞察，真实有温度，2-3句话，值得被摘录）

## 💌 写给自己
（一句真诚的话：鼓励、提醒或期许，来自日记真实感受，不要泛泛而谈）

注意：如果某章节日记中信息不足，内容可简短但不要跳过。直接输出报告，不要任何前缀说明。`
}

export async function aiSummary(params: AiSummaryParams): Promise<string> {
  const key = params.customApiKey?.trim() || ''
  const prompt = buildSummaryPrompt(params.period, params.diaries)

  if (key && isGeminiKey(key)) {
    const base = resolveGeminiBaseUrl(params.customBaseUrl)
    const model = resolveModel(key, params.customModel)
    return callGeminiBrowser(key, base, model, prompt, 1500)
  }

  // NVIDIA 及其他 OpenAI 兼容 provider → Edge Function（服务器端无 CORS 限制）
  const effectiveBaseUrl = (key && isNvidiaKey(key))
    ? resolveNvidiaBaseUrl(params.customBaseUrl)
    : (params.customBaseUrl || undefined)

  return callEdgeFunction('summary', {
    period: params.period,
    diaries: params.diaries,
    customApiKey: key || undefined,
    customBaseUrl: effectiveBaseUrl,
    customModel: params.customModel || resolveModel(key, params.customModel) || undefined,
  })
}
