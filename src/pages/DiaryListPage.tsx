import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, ChevronRight, Flame } from 'lucide-react'
import { useApp } from '@/contexts/AppContext'
import { getAllDiaries, getTodayDate } from '@/utils/storage'
import type { DiaryEntry } from '@/types/voxlog'
import { format, parseISO, isToday, isYesterday } from 'date-fns'

export default function DiaryListPage() {
  const { theme, t, config } = useApp()
  const navigate = useNavigate()
  const [diaries, setDiaries] = useState<DiaryEntry[]>([])

  useEffect(() => {
    setDiaries(getAllDiaries())
  }, [])

  // 计算连续打卡天数
  const streak = useMemo(() => {
    if (diaries.length === 0) return 0
    const today = getTodayDate()
    const dateSet = new Set(diaries.map(d => d.date))
    let count = 0
    let cursor = new Date()
    // 如果今天没有日记，从昨天开始
    if (!dateSet.has(today)) cursor.setDate(cursor.getDate() - 1)
    while (true) {
      const ds = format(cursor, 'yyyy-MM-dd')
      if (!dateSet.has(ds)) break
      count++
      cursor.setDate(cursor.getDate() - 1)
    }
    return count
  }, [diaries])

  // 按月份分组
  const grouped = useMemo(() => {
    const groups: { month: string; label: string; entries: DiaryEntry[] }[] = []
    for (const entry of diaries) {
      try {
        const d = parseISO(entry.date)
        const monthKey = format(d, 'yyyy-MM')
        const label = config.language === 'zh'
          ? format(d, 'yyyy年 M月')
          : format(d, 'MMMM yyyy')
        const last = groups[groups.length - 1]
        if (last && last.month === monthKey) {
          last.entries.push(entry)
        } else {
          groups.push({ month: monthKey, label, entries: [entry] })
        }
      } catch { /* skip */ }
    }
    return groups
  }, [diaries, config.language])

  function getExcerpt(content: string): string {
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('【'))
    const text = lines.join(' ').slice(0, 72)
    return text + (text.length >= 72 ? '...' : '')
  }

  function formatRelativeDate(dateStr: string): string {
    try {
      const d = parseISO(dateStr)
      if (isToday(d)) return config.language === 'zh' ? '今天' : 'Today'
      if (isYesterday(d)) return config.language === 'zh' ? '昨天' : 'Yesterday'
      return config.language === 'zh'
        ? format(d, 'M月d日 EEE')
        : format(d, 'MMM d, EEE')
    } catch { return dateStr }
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: theme.bg, color: theme.text }}>
      {/* 顶部 */}
      <div className="px-5 pt-safe pt-10 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: theme.text }}>{t.diaryList}</h1>
            <p className="text-xs mt-0.5" style={{ color: theme.mutedText }}>
              {config.language === 'zh' ? `共 ${diaries.length} 篇` : `${diaries.length} entries`}
            </p>
          </div>
          {/* 连续打卡徽章 */}
          {streak > 0 && (
            <div
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ background: `${theme.accent}18`, color: theme.accent }}
            >
              <Flame size={12} />
              <span>{streak}{config.language === 'zh' ? ' 天连续' : ` day${streak > 1 ? 's' : ''}`}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 pb-safe pb-20">
        {diaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <BookOpen size={36} style={{ color: `${theme.border}` }} />
            <p className="text-sm" style={{ color: theme.mutedText }}>{t.noDiary}</p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.month}>
              {/* 月份 header */}
              <div className="px-5 pt-2 pb-1.5 flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: theme.mutedText }}>
                  {group.label}
                </span>
                <span
                  className="flex-1 h-px"
                  style={{ background: theme.border }}
                />
                <span className="text-xs" style={{ color: theme.mutedText }}>
                  {group.entries.length}{config.language === 'zh' ? ' 篇' : ''}
                </span>
              </div>

              {/* 该月日记列表 */}
              <div className="px-4 flex flex-col gap-2">
                {group.entries.map(entry => (
                  <button
                    key={entry.date}
                    className="w-full text-left rounded-2xl overflow-hidden active:opacity-80 transition-opacity"
                    style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
                    onClick={() => navigate(`/diary/${entry.date}`)}
                  >
                    <div className="flex items-stretch">
                      {/* 左侧彩条 */}
                      <div
                        className="w-1 shrink-0 rounded-l-2xl"
                        style={{ background: theme.accent }}
                      />
                      <div className="flex-1 min-w-0 px-4 py-3.5 flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold mb-1" style={{ color: theme.accent }}>
                            {formatRelativeDate(entry.date)}
                          </div>
                          <p className="text-sm leading-relaxed text-pretty" style={{ color: theme.secondary }}>
                            {getExcerpt(entry.content)}
                          </p>
                        </div>
                        <ChevronRight size={14} className="shrink-0 mt-0.5" style={{ color: theme.mutedText }} />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
