import React, { useState } from 'react'
import { Bell, Globe, Palette, Trash2, Info, Crown, Key, Mail, Heart, ChevronRight, Check, Loader2, CheckCircle2, XCircle, Eye, EyeOff, Zap, Ticket, HelpCircle, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/contexts/AppContext'
import { clearCache } from '@/utils/storage'
import { exportAllAsZip } from '@/utils/exportZip'
import { verifyApiKey } from '@/utils/aiClient'
import { THEMES, MEMBER_NAMES } from '@/constants/themes'
import type { ThemeId, Language } from '@/types/voxlog'

const APP_VERSION = '1.0.0 (Demo)'

// Provider 快选预设
const PROVIDER_PRESETS = [
  {
    id: 'gemini',
    label: 'Gemini',
    baseUrl: '',
    model: 'gemini-2.0-flash',
    keyHint: 'AIza...',
    link: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'nvidia',
    label: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'nvidia/llama-3.1-nemotron-70b-instruct',
    keyHint: 'nvapi-...',
    link: 'https://build.nvidia.com/',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyHint: 'sk-...',
    link: 'https://platform.deepseek.com/',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyHint: 'sk-...',
    link: 'https://platform.openai.com/',
  },
] as const

export default function SettingsPage() {
  const {
    config, theme, t,
    setTheme, setLanguage,
    setReminderEnabled, setCustomApiKey, setCustomBaseUrl, setCustomModel,
    activateCode,
  } = useApp()

  const [showThemePicker, setShowThemePicker] = useState(false)
  const [showMemberPanel, setShowMemberPanel] = useState(false)
  const [showGeekMode, setShowGeekMode] = useState(false)
  const [apiKeyInput, setApiKeyInput] = useState(config.customApiKey)
  const [baseUrlInput, setBaseUrlInput] = useState(config.customBaseUrl)
  const [modelInput, setModelInput] = useState(config.customModel)
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null)
  const [verifyInfo, setVerifyInfo] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)

  // 激活码状态
  const [codeInput, setCodeInput] = useState('')
  const [activating, setActivating] = useState(false)
  const [showHowToGet, setShowHowToGet] = useState(false)

  // 导出状态
  const [exporting, setExporting] = useState(false)

  function handleSelectProvider(id: string) {
    const preset = PROVIDER_PRESETS.find(p => p.id === id)
    if (!preset) return
    setSelectedProvider(id)
    setBaseUrlInput(preset.baseUrl)
    // 只有模型字段为空时才填入默认模型，避免覆盖用户自定义
    setModelInput(prev => prev.trim() ? prev : preset.model)
    setVerifyResult(null)
    setVerifyInfo('')
  }

  function handleClearCache() {
    clearCache()
    toast.success(t.clearCacheSuccess)
  }

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const { native, savedPath } = await exportAllAsZip()
      const pathMsg = config.language === 'zh'
        ? `已保存到：${savedPath || '下载文件夹'}`
        : `Saved to: ${savedPath || 'Downloads'}`
      toast.success(native ? pathMsg : t.exportSuccess, { duration: 4000 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('暂无') || msg.includes('No diary')) {
        toast.warning(t.exportEmpty)
      } else {
        toast.error(msg)
      }
    } finally {
      setExporting(false)
    }
  }

  async function handleActivate() {
    const code = codeInput.trim()
    if (!code) {
      toast.error(config.language === 'zh' ? '请输入激活码' : 'Please enter activation code')
      return
    }
    setActivating(true)
    try {
      const { level, restored } = await activateCode(code)
      const levelName = MEMBER_NAMES[level][config.language]
      toast.success(restored ? t.activateRestored : `${t.activateSuccess}（${levelName}）`)
      setCodeInput('')
      setShowMemberPanel(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(msg)
    } finally {
      setActivating(false)
    }
  }

  function handleSaveGeekMode() {
    setCustomApiKey(apiKeyInput)
    setCustomBaseUrl(baseUrlInput)
    setCustomModel(modelInput)
    setVerifyResult(null)
    setVerifyInfo('')
    toast.success(config.language === 'zh' ? '设置已保存' : 'Settings saved')
  }

  async function handleVerify() {
    const key = apiKeyInput.trim()
    if (!key) {
      toast.error(config.language === 'zh' ? '请先填写 API Key' : 'Please enter your API Key')
      return
    }
    setVerifying(true)
    setVerifyResult(null)
    setVerifyInfo('')
    try {
      const { provider, model } = await verifyApiKey({
        customApiKey: key,
        customBaseUrl: baseUrlInput.trim() || undefined,
        customModel: modelInput.trim() || undefined,
      })
      setVerifyResult(true)
      setVerifyInfo(`${provider} · ${model}`)
      // 验证通过时顺手保存
      setCustomApiKey(key)
      setCustomBaseUrl(baseUrlInput)
      setCustomModel(modelInput)
      toast.success(t.apiKeyValid)
    } catch (err: unknown) {
      setVerifyResult(false)
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`${t.apiKeyInvalid}: ${msg}`)
    } finally {
      setVerifying(false)
    }
  }

  const memberColor = {
    free: theme.mutedText,
    standard: '#D97757',
    pro: '#8A5AC0',
  }[config.memberLevel]

  // 到期描述
  function getMemberExpireDesc(): string {
    if (config.memberLevel === 'free') return t.purchaseDemo
    if (config.memberExpiresAt === 0 || config.memberExpiresAt < 0) return t.memberPermanent
    if (config.memberExpiresAt > 0) {
      const d = new Date(config.memberExpiresAt)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return `${t.memberExpires}：${dateStr}`
    }
    return t.purchaseDemo
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: theme.bg, color: theme.text }}>
      <div className="px-5 pt-4 pb-4">
        <h1 className="text-xl font-bold" style={{ color: theme.text }}>{t.settings}</h1>
      </div>

      <div className="flex-1 px-4 pb-safe pb-16 overflow-y-auto">
        {/* 会员状态卡片 */}
        <div
          className="rounded-2xl p-5 mb-4 cursor-pointer active:opacity-80 transition-opacity"
          style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
          onClick={() => setShowMemberPanel(true)}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Crown size={16} style={{ color: memberColor }} />
                <span className="text-sm font-semibold" style={{ color: memberColor }}>
                  {MEMBER_NAMES[config.memberLevel][config.language]}
                </span>
              </div>
              <p className="text-xs mt-1 text-pretty" style={{ color: theme.mutedText }}>
                {getMemberExpireDesc()}
              </p>
            </div>
            <ChevronRight size={16} style={{ color: theme.mutedText }} />
          </div>
        </div>

        {/* 基础设置 */}
        <div
          className="rounded-2xl overflow-hidden mb-4"
          style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
        >
          {/* 每日提醒 */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div className="flex items-center gap-3">
              <Bell size={18} style={{ color: theme.secondary }} />
              <div>
                <div className="text-sm font-medium" style={{ color: theme.text }}>{t.reminder}</div>
                <div className="text-xs" style={{ color: theme.mutedText }}>{t.reminderTime}</div>
              </div>
            </div>
            <button
              className="relative w-12 h-6 rounded-full transition-colors"
              style={{ background: config.reminderEnabled ? theme.accent : theme.border }}
              onClick={() => setReminderEnabled(!config.reminderEnabled)}
            >
              <div
                className="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform"
                style={{ transform: config.reminderEnabled ? 'translateX(28px)' : 'translateX(4px)' }}
              />
            </button>
          </div>

          {/* 语言切换 */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div className="flex items-center gap-3">
              <Globe size={18} style={{ color: theme.secondary }} />
              <span className="text-sm font-medium" style={{ color: theme.text }}>{t.language}</span>
            </div>
            <div
              className="flex rounded-xl overflow-hidden"
              style={{ border: `1px solid ${theme.border}` }}
            >
              {(['zh', 'en'] as Language[]).map(lang => (
                <button
                  key={lang}
                  className="px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: config.language === lang ? theme.text : 'transparent',
                    color: config.language === lang ? theme.bg : theme.secondary,
                  }}
                  onClick={() => setLanguage(lang)}
                >
                  {lang === 'zh' ? '中文' : 'EN'}
                </button>
              ))}
            </div>
          </div>

          {/* 主题皮肤 */}
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer active:opacity-80"
            style={{ borderBottom: `1px solid ${theme.border}` }}
            onClick={() => setShowThemePicker(!showThemePicker)}
          >
            <div className="flex items-center gap-3">
              <Palette size={18} style={{ color: theme.secondary }} />
              <span className="text-sm font-medium" style={{ color: theme.text }}>{t.theme}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border" style={{ background: theme.bg, borderColor: theme.border }} />
              <span className="text-sm" style={{ color: theme.mutedText }}>
                {THEMES[config.theme][config.language === 'zh' ? 'nameZh' : 'nameEn']}
              </span>
              <ChevronRight size={14} style={{ color: theme.mutedText, transform: showThemePicker ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>
          </div>

          {/* 主题选择面板 */}
          {showThemePicker && (
            <div className="px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <div className="grid grid-cols-4 gap-3">
                {(Object.values(THEMES)).map(th => (
                  <button
                    key={th.id}
                    className="flex flex-col items-center gap-1.5 active:opacity-70"
                    onClick={() => setTheme(th.id as ThemeId)}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{
                        background: th.bg,
                        border: config.theme === th.id ? `2px solid ${th.accent}` : `2px solid ${th.border}`,
                      }}
                    >
                      {config.theme === th.id && (
                        <Check size={14} style={{ color: th.text }} />
                      )}
                    </div>
                    <span className="text-xs" style={{ color: theme.mutedText }}>
                      {config.language === 'zh' ? th.nameZh : th.nameEn}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 导出全部数据 */}
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer active:opacity-80"
            onClick={handleExport}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {exporting
                ? <Loader2 size={18} className="animate-spin shrink-0" style={{ color: theme.secondary }} />
                : <Download size={18} className="shrink-0" style={{ color: theme.secondary }} />
              }
              <div className="min-w-0">
                <div className="text-sm font-medium" style={{ color: theme.text }}>{t.exportAll}</div>
                <div className="text-xs truncate" style={{ color: theme.mutedText }}>{t.exportAllDesc}</div>
              </div>
            </div>
            <ChevronRight size={16} className="shrink-0 ml-2" style={{ color: theme.mutedText }} />
          </div>

          {/* 分隔线 */}
          <div style={{ height: 1, background: theme.border, margin: '0 20px' }} />

          {/* 清理缓存 */}
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer active:opacity-80"
            onClick={handleClearCache}
          >
            <div className="flex items-center gap-3">
              <Trash2 size={18} style={{ color: theme.secondary }} />
              <div>
                <div className="text-sm font-medium" style={{ color: theme.text }}>{t.clearCache}</div>
                <div className="text-xs" style={{ color: theme.mutedText }}>{t.clearCacheDesc}</div>
              </div>
            </div>
          </div>
        </div>

        {/* 极客模式 */}
        <div
          className="rounded-2xl overflow-hidden mb-4"
          style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
        >
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer active:opacity-80"
            onClick={() => setShowGeekMode(!showGeekMode)}
          >
            <div className="flex items-center gap-3">
              <Key size={18} style={{ color: theme.secondary }} />
              <div>
                <div className="text-sm font-medium" style={{ color: theme.text }}>{t.geekMode}</div>
                <div className="text-xs" style={{ color: theme.mutedText }}>{t.geekModeDesc}</div>
              </div>
            </div>
            <ChevronRight size={14} style={{ color: theme.mutedText, transform: showGeekMode ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>

          {showGeekMode && (
            <div className="px-5 pb-5" style={{ borderTop: `1px solid ${theme.border}` }}>
              <div className="pt-4 flex flex-col gap-3">

                {/* Provider 快选 */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Zap size={12} style={{ color: theme.mutedText }} />
                    <span className="text-xs" style={{ color: theme.mutedText }}>
                      {config.language === 'zh' ? '快速选择服务商' : 'Quick select provider'}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {PROVIDER_PRESETS.map(p => (
                      <button
                        key={p.id}
                        className="py-2 rounded-xl text-xs font-medium transition-all active:opacity-70"
                        style={{
                          background: selectedProvider === p.id ? theme.accent : theme.inputBg,
                          color: selectedProvider === p.id ? '#fff' : theme.secondary,
                          border: `1px solid ${selectedProvider === p.id ? theme.accent : theme.border}`,
                        }}
                        onClick={() => handleSelectProvider(p.id)}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  {/* 选中后显示获取 key 链接 */}
                  {selectedProvider && (() => {
                    const preset = PROVIDER_PRESETS.find(p => p.id === selectedProvider)
                    return preset ? (
                      <p className="text-xs mt-1.5" style={{ color: theme.mutedText }}>
                        {config.language === 'zh' ? 'API Key 格式：' : 'Key format: '}
                        <span style={{ color: theme.text }}>{preset.keyHint}</span>
                        {'　'}
                        <a
                          href={preset.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: theme.accent, textDecoration: 'underline' }}
                        >
                          {config.language === 'zh' ? '去获取 →' : 'Get key →'}
                        </a>
                      </p>
                    ) : null
                  })()}
                </div>

                {/* API Key */}
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: theme.mutedText }}>{t.apiKey}</label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      className="w-full rounded-xl px-3 py-2.5 pr-10 text-sm outline-none"
                      style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text }}
                      placeholder={t.apiKeyPlaceholder}
                      value={apiKeyInput}
                      onChange={e => { setApiKeyInput(e.target.value); setVerifyResult(null) }}
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: theme.mutedText }}
                      onClick={() => setShowApiKey(v => !v)}
                      tabIndex={-1}
                    >
                      {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Base URL */}
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: theme.mutedText }}>{t.baseUrl}</label>
                  <input
                    type="text"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text }}
                    placeholder={t.baseUrlPlaceholder}
                    value={baseUrlInput}
                    onChange={e => { setBaseUrlInput(e.target.value); setVerifyResult(null) }}
                  />
                </div>

                {/* 模型名称 */}
                <div>
                  <label className="text-xs mb-1.5 block" style={{ color: theme.mutedText }}>{t.modelName}</label>
                  <input
                    type="text"
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                    style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text }}
                    placeholder={t.modelNamePlaceholder}
                    value={modelInput}
                    onChange={e => { setModelInput(e.target.value); setVerifyResult(null) }}
                  />
                </div>

                {/* 验证结果提示 */}
                {verifyResult !== null && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
                    style={{
                      background: verifyResult ? '#16a34a18' : '#dc262618',
                      border: `1px solid ${verifyResult ? '#16a34a40' : '#dc262640'}`,
                    }}
                  >
                    {verifyResult
                      ? <CheckCircle2 size={14} color="#16a34a" />
                      : <XCircle size={14} color="#dc2626" />
                    }
                    <span style={{ color: verifyResult ? '#16a34a' : '#dc2626' }}>
                      {verifyResult
                        ? `${t.apiKeyValid}${verifyInfo ? `（${verifyInfo}）` : ''}`
                        : t.apiKeyInvalid}
                    </span>
                  </div>
                )}

                {/* 按钮行：保存 + 验证 */}
                <div className="flex gap-2 mt-1">
                  <button
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium active:opacity-80"
                    style={{ background: theme.text, color: theme.bg }}
                    onClick={handleSaveGeekMode}
                  >
                    {t.save}
                  </button>
                  <button
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium active:opacity-80 shrink-0"
                    style={{
                      background: theme.accent,
                      color: '#fff',
                      opacity: verifying ? 0.7 : 1,
                    }}
                    onClick={handleVerify}
                    disabled={verifying}
                  >
                    {verifying
                      ? <><Loader2 size={13} className="animate-spin" />{t.verifyingApiKey}</>
                      : t.verifyApiKey
                    }
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 关于 */}
        <div
          className="rounded-2xl overflow-hidden mb-4"
          style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
        >
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div className="flex items-center gap-3">
              <Info size={18} style={{ color: theme.secondary }} />
              <span className="text-sm font-medium" style={{ color: theme.text }}>{t.about}</span>
            </div>
            <span className="text-sm" style={{ color: theme.mutedText }}>{APP_VERSION}</span>
          </div>

          {/* 联系作者 */}
          <div className="px-5 py-4" style={{ borderBottom: `1px solid ${theme.border}` }}>
            <div className="flex items-center gap-3 mb-2">
              <Mail size={18} style={{ color: theme.secondary }} />
              <span className="text-sm font-medium" style={{ color: theme.text }}>{t.contactAuthor}</span>
            </div>
            <p className="text-xs leading-relaxed text-pretty" style={{ color: theme.mutedText }}>{t.contactDesc}</p>
          </div>

          {/* 鼓励作者 */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-2">
              <Heart size={18} style={{ color: '#ef4444' }} />
              <span className="text-sm font-medium" style={{ color: theme.text }}>{t.supportAuthor}</span>
            </div>
            <p className="text-xs leading-relaxed text-pretty" style={{ color: theme.mutedText }}>{t.supportDesc}</p>
          </div>
        </div>
      </div>

      {/* 激活码会员面板 */}
      {showMemberPanel && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 pb-6"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowMemberPanel(false) }}
        >
          <div
            className="w-full max-w-md rounded-3xl p-6 max-h-[88dvh] overflow-y-auto"
            style={{ background: theme.cardBg }}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between mb-5">
              <span className="text-base font-semibold" style={{ color: theme.text }}>{t.membership}</span>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-full text-base active:opacity-70"
                style={{ background: theme.inputBg, color: theme.mutedText }}
                onClick={() => setShowMemberPanel(false)}
              >✕</button>
            </div>

            {/* 当前状态 */}
            <div
              className="rounded-2xl p-4 mb-5 flex items-center gap-3"
              style={{ background: `${memberColor}12`, border: `1px solid ${memberColor}30` }}
            >
              <Crown size={20} style={{ color: memberColor, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: memberColor }}>
                  {MEMBER_NAMES[config.memberLevel][config.language]}
                </p>
                <p className="text-xs mt-0.5 truncate" style={{ color: theme.mutedText }}>
                  {getMemberExpireDesc()}
                </p>
              </div>
            </div>

            {/* 权益对比 */}
            <div className="flex gap-3 mb-5">
              {(['standard', 'pro'] as const).map(level => {
                const lColor = level === 'standard' ? '#D97757' : '#8A5AC0'
                const lName = MEMBER_NAMES[level][config.language]
                const isActive = config.memberLevel === level
                return (
                  <div
                    key={level}
                    className="flex-1 rounded-2xl p-3"
                    style={{
                      background: isActive ? `${lColor}10` : theme.inputBg,
                      border: `1.5px solid ${isActive ? lColor : theme.border}`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <Crown size={12} style={{ color: lColor }} />
                      <span className="text-xs font-semibold" style={{ color: lColor }}>{lName}</span>
                      {isActive && <Check size={11} style={{ color: lColor, marginLeft: 'auto' }} />}
                    </div>
                    {t.memberFeatures[level].map((f, i) => (
                      <p key={i} className="text-xs leading-relaxed" style={{ color: theme.mutedText }}>· {f}</p>
                    ))}
                  </div>
                )
              })}
            </div>

            {/* 激活码输入 */}
            <div className="mb-3">
              <label className="text-xs mb-1.5 block" style={{ color: theme.mutedText }}>{t.activationCode}</label>
              <input
                type="text"
                className="w-full rounded-xl px-3 py-3 text-sm outline-none tracking-wider font-mono"
                style={{ background: theme.inputBg, border: `1px solid ${theme.border}`, color: theme.text }}
                placeholder={t.activationCodePlaceholder}
                value={codeInput}
                onChange={e => setCodeInput(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleActivate()}
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>

            {/* 激活按钮 */}
            <button
              className="w-full py-3.5 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 active:opacity-80 transition-opacity mb-4"
              style={{ background: theme.text, color: theme.bg, opacity: activating ? 0.75 : 1 }}
              onClick={handleActivate}
              disabled={activating}
            >
              {activating
                ? <><Loader2 size={15} className="animate-spin" />{t.activating}</>
                : <><Ticket size={15} />{t.activate}</>
              }
            </button>

            {/* 如何获取激活码 */}
            <button
              className="w-full flex items-center justify-between py-2 px-1 active:opacity-70"
              onClick={() => setShowHowToGet(v => !v)}
            >
              <div className="flex items-center gap-2">
                <HelpCircle size={14} style={{ color: theme.mutedText }} />
                <span className="text-xs" style={{ color: theme.mutedText }}>{t.howToGetCode}</span>
              </div>
              <ChevronRight
                size={14}
                style={{ color: theme.mutedText, transform: showHowToGet ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}
              />
            </button>
            {showHowToGet && (
              <p className="text-xs leading-relaxed mt-2 px-1 pb-2 text-pretty" style={{ color: theme.mutedText }}>
                {t.howToGetCodeDesc}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
