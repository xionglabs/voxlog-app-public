import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Loader2, Lock, CalendarDays, Share2, RefreshCw, ChevronRight, Trash2, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/contexts/AppContext'
import {
  getDiariesByDateRange, getWeekRange, getMonthRange, getYearRange,
  saveSummaryRecord, getSummaryRecords, deleteSummaryRecord,
} from '@/utils/storage'
import { aiSummary } from '@/utils/aiClient'
import type { SummaryPeriod, SummaryRecord } from '@/types/voxlog'

// ── 解析结构 ─────────────────────────────────────────
interface Section {
  icon: string
  title: string
  raw: string
  type: 'keywords' | 'moments' | 'insights' | 'actions' | 'growth' | 'letter' | 'default'
}

function detectType(icon: string, title: string): Section['type'] {
  if (icon === '🎯' || title.includes('关键词')) return 'keywords'
  if (icon === '📅' || title.includes('时刻')) return 'moments'
  if (icon === '💡' || title.includes('知识') || title.includes('收获')) return 'insights'
  if (icon === '✅' || title.includes('行动') || title.includes('复盘')) return 'actions'
  if (icon === '🌱' || title.includes('成长') || title.includes('洞见')) return 'growth'
  if (icon === '💌' || title.includes('写给') || title.includes('寄语')) return 'letter'
  return 'default'
}

function parseSections(markdown: string): Section[] {
  const parts = markdown.split(/^## /m).filter(Boolean)
  return parts.map(part => {
    const lines = part.split('\n')
    const heading = lines[0].trim()
    const body = lines.slice(1).join('\n').trim()
    // 提取 emoji（开头表情符）
    const emojiMatch = heading.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/u)
    const icon = emojiMatch ? emojiMatch[1] : ''
    const title = heading.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, '').trim()
    return { icon, title, raw: body, type: detectType(icon, title) }
  })
}

// 解析 keywords：专注 | 突破 | 成长
function parseKeywords(raw: string): string[] {
  // 取括号外的第一行实际内容
  const line = raw.split('\n').find(l => l.trim() && !l.startsWith('（'))
  if (!line) return []
  return line.split(/\s*[|｜]\s*/).map(k => k.trim()).filter(Boolean)
}

// 简单内联加粗解析
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold">{p.slice(2, -2)}</strong>
      : p
  )
}

// 解析段落/列表
function renderBody(raw: string, textColor: string, mutedColor: string): React.ReactNode {
  const lines = raw.split('\n').filter(l => l.trim() && !l.startsWith('（'))
  return lines.map((line, i) => {
    if (line.startsWith('- ') || line.startsWith('• ')) {
      return (
        <div key={i} className="flex gap-2 text-sm leading-relaxed mb-1.5">
          <span style={{ color: mutedColor }} className="mt-0.5 shrink-0">•</span>
          <span style={{ color: textColor }}>{renderInline(line.slice(2))}</span>
        </div>
      )
    }
    return (
      <p key={i} className="text-sm leading-relaxed mb-1.5" style={{ color: textColor }}>
        {renderInline(line)}
      </p>
    )
  })
}

// ── Section 卡片 ──────────────────────────────────────
interface SectionCardProps {
  section: Section
  theme: ReturnType<typeof useApp>['theme']
  accentColor: string
}

function SectionCard({ section, theme, accentColor }: SectionCardProps) {
  if (section.type === 'keywords') {
    const keywords = parseKeywords(section.raw)
    return (
      <div className="rounded-2xl p-4" style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">{section.icon}</span>
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.mutedText }}>
            {section.title}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {keywords.length > 0 ? keywords.map((kw, i) => (
            <span
              key={i}
              className="px-3 py-1.5 rounded-full text-sm font-medium"
              style={{ background: `${accentColor}18`, color: accentColor, border: `1px solid ${accentColor}35` }}
            >
              {kw}
            </span>
          )) : (
            <p className="text-sm" style={{ color: theme.mutedText }}>{section.raw}</p>
          )}
        </div>
      </div>
    )
  }

  if (section.type === 'letter') {
    return (
      <div
        className="rounded-2xl p-5 relative overflow-hidden"
        style={{ background: `${accentColor}0D`, border: `1px solid ${accentColor}30` }}
      >
        {/* 左侧装饰竖线 */}
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: accentColor }} />
        <div className="pl-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">{section.icon}</span>
            <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: accentColor }}>
              {section.title}
            </span>
          </div>
          <p
            className="text-base font-medium leading-relaxed italic"
            style={{ color: theme.text }}
          >
            {section.raw.split('\n').find(l => l.trim() && !l.startsWith('（')) || section.raw}
          </p>
        </div>
      </div>
    )
  }

  if (section.type === 'growth') {
    return (
      <div className="rounded-2xl p-4" style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">{section.icon}</span>
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.mutedText }}>
            {section.title}
          </span>
        </div>
        <blockquote
          className="text-sm leading-relaxed pl-3"
          style={{ borderLeft: `3px solid ${accentColor}60`, color: theme.text }}
        >
          {renderBody(section.raw, theme.text, theme.mutedText)}
        </blockquote>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-4" style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{section.icon}</span>
        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: theme.mutedText }}>
          {section.title}
        </span>
      </div>
      <div>{renderBody(section.raw, theme.text, theme.mutedText)}</div>
    </div>
  )
}

// ── 复盘报告卡片 ─────────────────────────────────────
interface SummaryReportProps {
  markdown: string
  period: SummaryPeriod
  diaryCount: number
  dateRange: { start: string; end: string }
  theme: ReturnType<typeof useApp>['theme']
  language: string
  onRefresh?: () => void
  refreshing?: boolean
  onDelete?: () => void
}

function SummaryReport({ markdown, period, diaryCount, dateRange, theme, language, onRefresh, refreshing, onDelete }: SummaryReportProps) {
  const reportRef = useRef<HTMLDivElement>(null)
  const periodZh = { week: '周', month: '月', year: '年' }[period] || '周'
  const periodLabel = language === 'zh'
    ? `${periodZh}复盘报告`
    : { week: 'Weekly Review', month: 'Monthly Review', year: 'Yearly Review' }[period] || 'Review'

  const sections = parseSections(markdown)
  const accentColor = theme.accent

  const handleShare = useCallback(async () => {
    if (!reportRef.current) return
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: theme.bg,
        useCORS: true,
        logging: false,
      })
      const url = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url
      a.download = `VoxLog-${periodLabel}-${dateRange.start}.png`
      a.click()
      toast.success(language === 'zh' ? '图片已保存，可分享到朋友圈～' : 'Image saved, share it!')
    } catch {
      toast.error(language === 'zh' ? '导出失败，请重试' : 'Export failed')
    }
  }, [theme.bg, periodLabel, dateRange.start, language])

  return (
    <div>
      {/* 报告主体（用于截图） */}
      <div ref={reportRef} className="rounded-2xl overflow-hidden" style={{ background: theme.bg }}>
        {/* 顶部 Header */}
        <div
          className="px-5 pt-6 pb-5 relative overflow-hidden"
          style={{ background: theme.cardBg, borderBottom: `1px solid ${theme.border}` }}
        >
          {/* 装饰圆 */}
          <div
            className="absolute -right-8 -top-8 w-32 h-32 rounded-full opacity-10"
            style={{ background: accentColor }}
          />
          <div
            className="absolute -right-2 top-10 w-16 h-16 rounded-full opacity-5"
            style={{ background: accentColor }}
          />
          <p className="text-xs font-medium tracking-widest mb-1" style={{ color: theme.mutedText }}>VOXLOG</p>
          <h2 className="text-xl font-bold mb-3 text-balance" style={{ color: theme.text }}>{periodLabel}</h2>
          <div className="flex items-center gap-3 text-xs" style={{ color: theme.mutedText }}>
            <span>{dateRange.start} ~ {dateRange.end}</span>
            <span>·</span>
            <span>{language === 'zh' ? `共 ${diaryCount} 篇` : `${diaryCount} entries`}</span>
          </div>
        </div>

        {/* 各章节 */}
        <div className="p-4 flex flex-col gap-3">
          {sections.map((sec, i) => (
            <SectionCard key={i} section={sec} theme={theme} accentColor={accentColor} />
          ))}
        </div>

        {/* 底部品牌 */}
        <div className="px-5 pb-5 flex items-center justify-center gap-2">
          <span className="text-xs" style={{ color: theme.mutedText }}>✦</span>
          <span className="text-xs tracking-wide" style={{ color: theme.mutedText }}>VoxLog 口述日记</span>
          <span className="text-xs" style={{ color: theme.mutedText }}>✦</span>
        </div>
      </div>

      {/* 操作按钮区（截图范围外） */}
      <div className="flex gap-3 mt-4">
        {onDelete && (
          <button
            className="py-3.5 px-4 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.mutedText }}
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </button>
        )}
        {onRefresh && (
          <button
            className="flex-1 py-3.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
            style={{ background: theme.cardBg, border: `1px solid ${theme.border}`, color: theme.text }}
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            {language === 'zh' ? '重新生成' : 'Regenerate'}
          </button>
        )}
        <button
          className="flex-1 py-3.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
          style={{ background: theme.text, color: theme.bg }}
          onClick={handleShare}
        >
          <Share2 size={15} />
          {language === 'zh' ? '导出分享' : 'Export & Share'}
        </button>
      </div>
    </div>
  )
}

// ── 历史记录卡片 ─────────────────────────────────────
interface HistoryCardProps {
  record: SummaryRecord
  theme: ReturnType<typeof useApp>['theme']
  language: string
  onClick: () => void
}

function HistoryCard({ record, theme, language, onClick }: HistoryCardProps) {
  const periodLabel = language === 'zh'
    ? { week: '周复盘', month: '月复盘', year: '年度复盘' }[record.period]
    : { week: 'Weekly', month: 'Monthly', year: 'Yearly' }[record.period]

  // 生成标题：2025年第18周 / 2025年5月 / 2025年度
  function buildTitle(r: SummaryRecord): string {
    const d = new Date(r.dateRange.start)
    if (r.period === 'week') {
      // 计算第几周（ISO 近似）
      const start = new Date(d.getFullYear(), 0, 1)
      const weekNum = Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
      return language === 'zh'
        ? `${d.getFullYear()}年 第${weekNum}周`
        : `${d.getFullYear()} Week ${weekNum}`
    }
    if (r.period === 'month') {
      return language === 'zh'
        ? `${d.getFullYear()}年${d.getMonth() + 1}月`
        : `${d.toLocaleString('en', { month: 'long' })} ${d.getFullYear()}`
    }
    return language === 'zh' ? `${d.getFullYear()}年度` : `Year ${d.getFullYear()}`
  }

  const genDate = new Date(record.generatedAt)
  const genStr = `${String(genDate.getMonth() + 1).padStart(2, '0')}-${String(genDate.getDate()).padStart(2, '0')}`

  return (
    <button
      className="w-full text-left rounded-2xl p-4 active:opacity-75 transition-opacity"
      style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold truncate" style={{ color: theme.text }}>
              {buildTitle(record)}
            </span>
            <span
              className="shrink-0 text-xs px-1.5 py-0.5 rounded-md"
              style={{ background: `${theme.accent}18`, color: theme.accent }}
            >
              {periodLabel}
            </span>
          </div>
          {/* 关键词摘要 */}
          {record.keywords.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {record.keywords.map((kw, i) => (
                <span key={i} className="text-xs" style={{ color: theme.mutedText }}>
                  {i > 0 && <span className="mr-1.5" style={{ color: theme.border }}>·</span>}
                  {kw}
                </span>
              ))}
            </div>
          ) : null}
          {/* 日期范围 + 篇数 */}
          <p className="text-xs" style={{ color: theme.mutedText }}>
            {record.dateRange.start} ~ {record.dateRange.end}
            <span className="mx-1.5">·</span>
            {language === 'zh' ? `${record.diaryCount} 篇` : `${record.diaryCount} entries`}
            <span className="mx-1.5">·</span>
            {language === 'zh' ? `${genStr} 生成` : `Generated ${genStr}`}
          </p>
        </div>
        <ChevronRight size={16} className="shrink-0 mt-0.5" style={{ color: theme.border }} />
      </div>
    </button>
  )
}

// ── 辅助：从 markdown 提取关键词 ──────────────────────
function extractKeywordsFromMarkdown(markdown: string): string[] {
  const sections = parseSections(markdown)
  const kwSection = sections.find(s => s.type === 'keywords')
  if (!kwSection) return []
  return parseKeywords(kwSection.raw)
}

// ── 主页面 ────────────────────────────────────────────
export default function SummaryPage() {
  const { theme, t, config } = useApp()
  const [activePeriod, setActivePeriod] = useState<SummaryPeriod>('week')

  // 当前 session 生成的内容（内存态）
  const [currentContent, setCurrentContent] = useState<Record<SummaryPeriod, string>>({
    week: '', month: '', year: '',
  })
  const [currentMeta, setCurrentMeta] = useState<Record<SummaryPeriod, { count: number; start: string; end: string } | null>>({
    week: null, month: null, year: null,
  })
  const [loading, setLoading] = useState<SummaryPeriod | null>(null)

  // 历史记录（从 localStorage 加载，按 period 过滤后展示）
  const [historyMap, setHistoryMap] = useState<Record<SummaryPeriod, SummaryRecord[]>>({
    week: [], month: [], year: [],
  })

  // 正在查看的历史详情
  const [viewingRecord, setViewingRecord] = useState<SummaryRecord | null>(null)

  // 切换 period 时加载对应历史
  useEffect(() => {
    setHistoryMap(prev => ({
      ...prev,
      [activePeriod]: getSummaryRecords(activePeriod),
    }))
    setViewingRecord(null)
  }, [activePeriod])

  const hasCustomKey = Boolean(config.customApiKey?.trim())

  const canAccess = useCallback((period: SummaryPeriod): boolean => {
    if (hasCustomKey) return true
    if (period === 'week') return config.memberLevel !== 'free'
    if (period === 'month') return config.memberLevel === 'standard' || config.memberLevel === 'pro'
    if (period === 'year') return config.memberLevel === 'pro'
    return false
  }, [config.memberLevel, hasCustomKey])

  const handleGenerate = useCallback(async (period: SummaryPeriod) => {
    if (!canAccess(period)) {
      toast.error(config.language === 'zh' ? '此功能需要会员解锁' : 'This feature requires membership')
      return
    }
    if (!config.customApiKey?.trim()) {
      toast.error(config.language === 'zh'
        ? '请先在设置 → 极客模式中配置 API Key'
        : 'Please configure your API Key in Settings → Geek Mode')
      return
    }

    let range: { start: string; end: string }
    if (period === 'week') range = getWeekRange()
    else if (period === 'month') range = getMonthRange()
    else range = getYearRange()

    const diaries = getDiariesByDateRange(range.start, range.end)
    if (diaries.length === 0) {
      toast.error(t.noDataForSummary)
      return
    }

    setLoading(period)
    setViewingRecord(null)
    try {
      const result = await aiSummary({
        period,
        diaries: diaries.map(d => ({ date: d.date, content: d.content })),
        customApiKey: config.customApiKey || undefined,
        customBaseUrl: config.customBaseUrl || undefined,
        customModel: config.customModel || undefined,
      })

      // 更新内存态
      setCurrentContent(prev => ({ ...prev, [period]: result }))
      setCurrentMeta(prev => ({ ...prev, [period]: { count: diaries.length, ...range } }))

      // 自动保存到 localStorage
      const record: SummaryRecord = {
        id: String(Date.now()),
        period,
        dateRange: range,
        diaryCount: diaries.length,
        content: result,
        keywords: extractKeywordsFromMarkdown(result),
        generatedAt: Date.now(),
      }
      saveSummaryRecord(record)
      setHistoryMap(prev => ({ ...prev, [period]: getSummaryRecords(period) }))
      toast.success(config.language === 'zh' ? '复盘报告已保存' : 'Report saved')
    } catch (err) {
      console.error('总结生成失败:', err)
      toast.error(err instanceof Error ? err.message : t.aiError)
    } finally {
      setLoading(null)
    }
  }, [canAccess, config, t])

  const handleDeleteRecord = useCallback((id: string) => {
    deleteSummaryRecord(id)
    setHistoryMap(prev => ({ ...prev, [activePeriod]: getSummaryRecords(activePeriod) }))
    if (viewingRecord?.id === id) setViewingRecord(null)
    toast.success(config.language === 'zh' ? '已删除' : 'Deleted')
  }, [activePeriod, viewingRecord, config.language])

  const periods: { id: SummaryPeriod; label: string }[] = [
    { id: 'week', label: t.weekSummary },
    { id: 'month', label: t.monthSummary },
    { id: 'year', label: t.yearSummary },
  ]

  const activeContent = currentContent[activePeriod]
  const activeMeta = currentMeta[activePeriod]
  const isLocked = !canAccess(activePeriod)
  const isLoading = loading === activePeriod
  const history = historyMap[activePeriod]

  // ── 详情视图 ──
  if (viewingRecord) {
    return (
      <div className="flex flex-col min-h-screen" style={{ background: theme.bg }}>
        {/* 顶部导航 */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-4">
          <button
            className="p-2 -ml-2 rounded-xl active:opacity-70"
            style={{ color: theme.text }}
            onClick={() => setViewingRecord(null)}
          >
            <ArrowLeft size={20} />
          </button>
          <span className="text-base font-semibold" style={{ color: theme.text }}>
            {config.language === 'zh' ? '复盘详情' : 'Review Detail'}
          </span>
        </div>
        <div className="flex-1 px-4 pb-safe pb-16 overflow-y-auto">
          <SummaryReport
            markdown={viewingRecord.content}
            period={viewingRecord.period}
            diaryCount={viewingRecord.diaryCount}
            dateRange={viewingRecord.dateRange}
            theme={theme}
            language={config.language}
            onDelete={() => handleDeleteRecord(viewingRecord.id)}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: theme.bg, color: theme.text }}>
      <div className="px-5 pt-4 pb-4">
        <h1 className="text-xl font-bold" style={{ color: theme.text }}>{t.aiSummary}</h1>
      </div>

      {/* Tab 切换 */}
      <div className="px-4 mb-4">
        <div
          className="flex rounded-2xl p-1 gap-1"
          style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
        >
          {periods.map(p => (
            <button
              key={p.id}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: activePeriod === p.id ? theme.text : 'transparent',
                color: activePeriod === p.id ? theme.bg : theme.secondary,
              }}
              onClick={() => setActivePeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 px-4 pb-safe pb-16">
        {isLocked ? (
          <div
            className="rounded-2xl p-8 flex flex-col items-center justify-center gap-4"
            style={{ background: theme.cardBg, border: `1px dashed ${theme.border}` }}
          >
            <Lock size={32} style={{ color: theme.border }} />
            <p className="text-sm text-center" style={{ color: theme.mutedText }}>
              {config.language === 'zh'
                ? `${activePeriod === 'year' ? 'Pro 会员' : '会员'}专属功能，请在设置中解锁`
                : `${activePeriod === 'year' ? 'Pro membership' : 'Membership'} required`}
            </p>
          </div>
        ) : (
          <>
            {/* ── 本次生成区域 ── */}
            {activeContent && activeMeta ? (
              <SummaryReport
                markdown={activeContent}
                period={activePeriod}
                diaryCount={activeMeta.count}
                dateRange={{ start: activeMeta.start, end: activeMeta.end }}
                theme={theme}
                language={config.language}
                onRefresh={() => handleGenerate(activePeriod)}
                refreshing={isLoading}
              />
            ) : (
              <div>
                <div
                  className="rounded-2xl p-8 flex flex-col items-center justify-center gap-4"
                  style={{ background: theme.cardBg, border: `1px dashed ${theme.border}` }}
                >
                  <CalendarDays size={32} style={{ color: theme.border }} />
                  <p className="text-sm text-center text-pretty" style={{ color: theme.mutedText }}>
                    {config.language === 'zh'
                      ? 'AI 将深度分析你的日记，生成专属复盘报告'
                      : 'AI will analyze your diaries and generate a personalized review'}
                  </p>
                </div>
                <button
                  className="w-full mt-4 py-3.5 rounded-2xl text-sm font-medium flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
                  style={{ background: theme.text, color: theme.bg }}
                  onClick={() => handleGenerate(activePeriod)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {config.language === 'zh' ? '深度分析中，请稍候…' : 'Analyzing…'}
                    </>
                  ) : t.generate}
                </button>
              </div>
            )}

            {/* ── 历史复盘记录 ── */}
            {history.length > 0 && (
              <div className="mt-8">
                <h2 className="text-xs font-semibold tracking-widest mb-3 px-1" style={{ color: theme.mutedText }}>
                  {config.language === 'zh' ? '历史复盘' : 'PAST REVIEWS'}
                </h2>
                <div className="flex flex-col gap-2.5">
                  {history.map(record => (
                    <HistoryCard
                      key={record.id}
                      record={record}
                      theme={theme}
                      language={config.language}
                      onClick={() => setViewingRecord(record)}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
