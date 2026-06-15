import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── API 类型检测（通行做法：优先 key 前缀，再看 baseUrl）──
// Gemini key 固定以 AIza 开头（Google API Key 规范）
// NVIDIA NIM key 固定以 nvapi- 开头
// OpenAI/DeepSeek/Moonshot/智谱等均以 sk- 开头，走 OpenAI 兼容协议
function detectGemini(apiKey: string, baseUrl: string): boolean {
  if (baseUrl.includes('generativelanguage.googleapis.com') && !baseUrl.includes('/openai')) return true
  if (apiKey.startsWith('AIza')) return true
  return false
}

function isNvidiaKey(apiKey: string): boolean {
  return apiKey.startsWith('nvapi-')
}

// Gemini key 自动补全官方 base URL
function resolveGeminiBaseUrl(baseUrl: string): string {
  const isDefault = !baseUrl || baseUrl === 'https://api.openai.com/v1'
  return isDefault ? 'https://generativelanguage.googleapis.com/v1beta' : baseUrl.replace(/\/$/, '')
}

// 用 Gemini 原生格式（generateContent）发请求
async function callGemini(baseUrl: string, apiKey: string, model: string, prompt: string, maxTokens: number): Promise<Response> {
  const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
    }),
  })
}

// 从 Gemini 响应中取文本
function extractGeminiText(json: Record<string, unknown>): string {
  try {
    const candidates = json.candidates as Array<{ content: { parts: Array<{ text: string }> } }>
    return candidates?.[0]?.content?.parts?.[0]?.text || ''
  } catch {
    return ''
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, transcript, existingContent, date, diaries, period, customApiKey, customBaseUrl, customModel } = await req.json()

    const apiKey = customApiKey || Deno.env.get('OPENAI_API_KEY')
    const rawBaseUrl = (customBaseUrl || Deno.env.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1').replace(/\/$/, '')

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: '未配置 AI API Key，请在设置中填写您的 API Key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 自动识别 API 类型（key 前缀 > baseUrl）
    const gemini = detectGemini(apiKey, rawBaseUrl)
    const baseUrl = gemini ? resolveGeminiBaseUrl(rawBaseUrl) : rawBaseUrl
    // 模型名：未填写时按 API 类型给默认值
    const defaultModel = gemini
      ? 'gemini-2.0-flash'
      : isNvidiaKey(apiKey)
        ? 'meta/llama-3.1-8b-instruct'   // 8B 小模型，~10-20s，不超时
        : 'gpt-4o-mini'
    const model = customModel?.trim() || defaultModel

    // ── 验证 Key 可用性 ──
    if (action === 'test') {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 45000)
      let testRes: Response
      try {
        if (gemini) {
          testRes = await fetch(`${baseUrl}/models?key=${apiKey}`, { signal: ctrl.signal })
        } else {
          testRes = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 5 }),
            signal: ctrl.signal,
          })
        }
      } finally {
        clearTimeout(timer)
      }
      if (!testRes.ok) {
        const errText = await testRes.text()
        return new Response(
          JSON.stringify({ error: `验证失败 (${testRes.status}): ${errText}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      return new Response(
        JSON.stringify({ result: 'ok', provider: gemini ? 'gemini' : 'openai', model }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── 构建 prompt ──
    let prompt = ''

    if (action === 'organize') {
      if (existingContent) {
        prompt = `你是一个专业的日记整理助手。用户已有当天的日记内容，现在有新的口述内容，请将两部分内容合并整理成完整的日记。

当天已有日记：
${existingContent}

新的口述内容：
${transcript}

请将以上内容合并整理，输出格式如下（严格按此格式，保留所有原有信息，补充新内容）：
【日期】${date}
【天气】
【今日记录】
（合并整理今日主要事件和经历）
【每日新知】
（提炼今天学到的知识或新发现，若无则留空）
【今日备忘】
（整理待办或需要记住的事项，若无则留空）

直接输出日记内容，不要添加任何解释或前缀。`
      } else {
        prompt = `你是一个专业的日记整理助手。请将以下口述内容整理成标准日记格式。

口述内容：
${transcript}

请输出格式如下（严格按此格式）：
【日期】${date}
【天气】
【今日记录】
（整理今日主要事件和经历）
【每日新知】
（提炼今天学到的知识或新发现，若无则留空）
【今日备忘】
（整理待办或需要记住的事项，若无则留空）

直接输出日记内容，不要添加任何解释或前缀。`
      }
    } else if (action === 'summary') {
      const periodMap: Record<string, string> = { week: '周', month: '月', year: '年' }
      const periodName = periodMap[period] || '周'
      // 截断每篇至 500 字（月/年日记多，保留更多上下文）
      const diaryTexts = diaries
        .map((d: { date: string; content: string }) => {
          const body = d.content.length > 500 ? d.content.slice(0, 500) + '…' : d.content
          return `[${d.date}]\n${body}`
        })
        .join('\n\n---\n\n')

      prompt = `你是一位有洞察力的个人成长教练。请深度阅读以下${periodName}日记，生成一份真诚、有价值的个人复盘报告。

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

    // ── 调用 AI ──
    let result = ''

    // 45s 超时保护（Edge Function 硬限制 60s，留 15s 余量给网络和响应处理）
    const aiCtrl = new AbortController()
    const aiTimer = setTimeout(() => aiCtrl.abort(), 45000)

    try {
      if (gemini) {
        const response = await callGemini(baseUrl, apiKey, model, prompt, action === 'summary' ? 1500 : 2000)
        clearTimeout(aiTimer)
        if (!response.ok) {
          const errText = await response.text()
          return new Response(
            JSON.stringify({ error: `Gemini 调用失败 (${response.status}): ${errText}` }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        const data = await response.json()
        result = extractGeminiText(data)
      } else {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: action === 'summary' ? 1500 : 2000,
          }),
          signal: aiCtrl.signal,
        })
        clearTimeout(aiTimer)
        if (!response.ok) {
          const errText = await response.text()
          return new Response(
            JSON.stringify({ error: `AI 服务调用失败 (${response.status}): ${errText}` }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        const data = await response.json()
        result = data.choices?.[0]?.message?.content || ''
      }
    } catch (fetchErr) {
      clearTimeout(aiTimer)
      const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError'
      return new Response(
        JSON.stringify({ error: isTimeout
          ? 'AI 响应超时（45s），请尝试换用更小的模型（如 meta/llama-3.1-8b-instruct）或减少日记条数'
          : `请求失败: ${fetchErr.message}` }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `服务器错误: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
