import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { AppConfig, DiaryEntry, ThemeId, Language, MemberLevel } from '@/types/voxlog'
import { THEMES, MEMBER_LIMITS } from '@/constants/themes'
import { loadConfig, saveConfig, loadDiary, getTodayDate, initDemoData, DEVICE_ID_KEY, checkAndRestoreConfig } from '@/utils/storage'
import { i18n } from '@/i18n'
import { supabase } from '@/db/supabase'

// ── 匿名设备 ID：首次生成后永久存储 ──
function generateFallbackId(): string {
  // 兼容不支持 crypto.randomUUID() 的环境（http / 旧浏览器）
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : generateFallbackId()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

interface AppContextValue {
  config: AppConfig
  theme: typeof THEMES[ThemeId]
  t: typeof i18n['zh']
  // 配置操作
  setTheme: (theme: ThemeId) => void
  setLanguage: (lang: Language) => void
  setMemberLevel: (level: MemberLevel) => void
  setReminderEnabled: (enabled: boolean) => void
  setCustomApiKey: (key: string) => void
  setCustomBaseUrl: (url: string) => void
  setCustomModel: (model: string) => void
  // 日记操作
  todayDiary: DiaryEntry | null
  refreshTodayDiary: () => void
  // AI 次数
  remainingAiCount: number
  consumeAiCount: () => boolean
  // 激活码
  activateCode: (code: string) => Promise<{ level: MemberLevel; expiresAt: number; restored: boolean }>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = loadConfig()
    // 确保 deviceId 始终有值
    if (!saved.deviceId) {
      const deviceId = getOrCreateDeviceId()
      const next = { ...saved, deviceId }
      saveConfig(next)
      return next
    }
    return saved
  })
  const [todayDiary, setTodayDiary] = useState<DiaryEntry | null>(null)

  // 初始化：恢复配置（覆盖安装时从 Preferences 恢复）+ 演示数据 + 今日日记
  useEffect(() => {
    checkAndRestoreConfig().then(() => {
      // 恢复后重新加载配置
      const restored = loadConfig()
      setConfig(restored)
      initDemoData()
      refreshTodayDiary()
    })
  }, [])

  // 主题
  const theme = THEMES[config.theme]

  // 翻译
  const t = i18n[config.language]

  // 应用主题色到 document
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--app-bg', theme.bg)
    root.style.setProperty('--app-text', theme.text)
    root.style.setProperty('--app-secondary', theme.secondary)
    root.style.setProperty('--app-accent', theme.accent)
    root.style.setProperty('--app-border', theme.border)
    root.style.setProperty('--app-input-bg', theme.inputBg)
    root.style.setProperty('--app-card-bg', theme.cardBg)
    root.style.setProperty('--app-muted', theme.mutedText)
    document.body.style.background = theme.bg
    document.body.style.color = theme.text
  }, [theme])

  const updateConfig = useCallback((updates: Partial<AppConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...updates }
      saveConfig(next)
      return next
    })
  }, [])

  // ── 启动时检查会员是否到期 ──
  useEffect(() => {
    if (config.memberLevel !== 'free' && config.memberExpiresAt > 0 && Date.now() > config.memberExpiresAt) {
      updateConfig({ memberLevel: 'free', memberExpiresAt: -1 })
    }
  }, [config.memberLevel, config.memberExpiresAt, updateConfig])

  const setTheme = useCallback((themeId: ThemeId) => {
    updateConfig({ theme: themeId })
  }, [updateConfig])

  const setLanguage = useCallback((lang: Language) => {
    updateConfig({ language: lang })
  }, [updateConfig])

  const setMemberLevel = useCallback((level: MemberLevel) => {
    updateConfig({ memberLevel: level })
  }, [updateConfig])

  const setReminderEnabled = useCallback((enabled: boolean) => {
    updateConfig({ reminderEnabled: enabled })
    if (enabled && 'Notification' in window) {
      Notification.requestPermission()
    }
  }, [updateConfig])

  const setCustomApiKey = useCallback((key: string) => {
    updateConfig({ customApiKey: key })
  }, [updateConfig])

  const setCustomBaseUrl = useCallback((url: string) => {
    updateConfig({ customBaseUrl: url })
  }, [updateConfig])

  const setCustomModel = useCallback((model: string) => {
    updateConfig({ customModel: model })
  }, [updateConfig])

  const refreshTodayDiary = useCallback(() => {
    const diary = loadDiary(getTodayDate())
    setTodayDiary(diary)
  }, [])

  // 计算今日剩余 AI 次数
  const todayStr = getTodayDate()
  const usedToday = config.dailyAiCount[todayStr] || 0
  const limit = MEMBER_LIMITS[config.memberLevel].dailyAiCount
  const remainingAiCount = Math.max(0, limit - usedToday)

  const consumeAiCount = useCallback((): boolean => {
    const today = getTodayDate()
    const used = config.dailyAiCount[today] || 0
    const lim = MEMBER_LIMITS[config.memberLevel].dailyAiCount
    if (used >= lim) return false
    updateConfig({
      dailyAiCount: { ...config.dailyAiCount, [today]: used + 1 }
    })
    return true
  }, [config, updateConfig])

  // ── 激活码验证（调用 Edge Function，云端校验）──
  const activateCode = useCallback(async (code: string): Promise<{ level: MemberLevel; expiresAt: number; restored: boolean }> => {
    const deviceId = config.deviceId || getOrCreateDeviceId()
    const { data, error } = await supabase.functions.invoke('activate-code', {
      body: { code: code.trim().toUpperCase(), deviceId },
    })
    if (error) {
      const msg = await error?.context?.text?.()
      throw new Error(msg || error.message)
    }
    if (!data?.success) {
      throw new Error(data?.error || '激活失败')
    }
    // expiresAt: null = 永久(0)，否则转为 ms 时间戳
    const expiresAt = data.expiresAt ? new Date(data.expiresAt).getTime() : 0
    updateConfig({
      memberLevel: data.level as MemberLevel,
      memberExpiresAt: expiresAt,
    })
    return { level: data.level as MemberLevel, expiresAt, restored: !!data.restored }
  }, [config.deviceId, updateConfig])

  return (
    <AppContext.Provider value={{
      config,
      theme,
      t,
      setTheme,
      setLanguage,
      setMemberLevel,
      setReminderEnabled,
      setCustomApiKey,
      setCustomBaseUrl,
      setCustomModel,
      todayDiary,
      refreshTodayDiary,
      remainingAiCount,
      consumeAiCount,
      activateCode,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
