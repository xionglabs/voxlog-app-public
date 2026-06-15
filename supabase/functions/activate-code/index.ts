import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { code, deviceId } = await req.json()

    if (!code?.trim() || !deviceId?.trim()) {
      return json({ error: '参数缺失：code 和 deviceId 为必填项' }, 400)
    }

    const normalizedCode = (code as string).trim().toUpperCase()

    // 用 service_role 绕过 RLS 直接操作
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── 1. 查询激活码 ──
    const { data: record, error: queryErr } = await supabase
      .from('activation_codes')
      .select('*')
      .eq('code', normalizedCode)
      .maybeSingle()

    if (queryErr) return json({ error: `查询失败: ${queryErr.message}` }, 500)
    if (!record)  return json({ error: '激活码不存在，请检查输入是否正确' }, 404)

    // ── 2. 已绑定设备，但不是本设备 ──
    if (record.device_id && record.device_id !== deviceId) {
      return json({ error: '该激活码已在其他设备使用，如需换绑请联系支持' }, 403)
    }

    // ── 3. 检查是否到期（同设备重新激活时也要验证）──
    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return json({ error: '该激活码已过期，请购买新的激活码' }, 410)
    }

    // ── 4. 首次激活：计算到期时间并写入 ──
    if (!record.device_id) {
      let expiresAt: string | null = null
      if (record.duration_days !== -1) {
        const d = new Date()
        d.setDate(d.getDate() + record.duration_days)
        expiresAt = d.toISOString()
      }

      const { error: updateErr } = await supabase
        .from('activation_codes')
        .update({
          device_id: deviceId,
          activated_at: new Date().toISOString(),
          expires_at: expiresAt,
        })
        .eq('code', normalizedCode)

      if (updateErr) return json({ error: `激活失败: ${updateErr.message}` }, 500)

      return json({
        success: true,
        level: record.level,
        expiresAt: expiresAt,          // null = 永久
        durationDays: record.duration_days,
      })
    }

    // ── 5. 同设备重新激活（换机恢复）──
    return json({
      success: true,
      level: record.level,
      expiresAt: record.expires_at ?? null,
      durationDays: record.duration_days,
      restored: true,
    })

  } catch (err) {
    return json({ error: `服务器错误: ${err.message}` }, 500)
  }
})
