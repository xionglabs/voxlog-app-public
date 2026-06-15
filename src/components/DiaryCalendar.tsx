import React, { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, isSameDay, parseISO } from 'date-fns'
import type { Theme } from '@/types/voxlog'

interface DiaryCalendarProps {
  /** 已有日记的日期集合（YYYY-MM-DD） */
  diaryDates: Set<string>
  /** 当前选中日期（YYYY-MM-DD） */
  selectedDate: string
  /** 语言 */
  language: 'zh' | 'en'
  /** 主题 */
  theme: Theme
  /** 选中日期变化 */
  onSelectDate: (date: string) => void
}

const WEEK_DAYS_ZH = ['一', '二', '三', '四', '五', '六', '日']
const WEEK_DAYS_EN = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export default function DiaryCalendar({
  diaryDates,
  selectedDate,
  language,
  theme,
  onSelectDate,
}: DiaryCalendarProps) {
  const [viewMonth, setViewMonth] = useState(() => {
    // 初始显示选中日期所在月
    try { return startOfMonth(parseISO(selectedDate)) } catch { return startOfMonth(new Date()) }
  })

  const weekDays = language === 'zh' ? WEEK_DAYS_ZH : WEEK_DAYS_EN

  // 计算当月所有日期格子（含补齐的空格）
  const calendarCells = useMemo(() => {
    const start = startOfMonth(viewMonth)
    const end = endOfMonth(viewMonth)
    const days = eachDayOfInterval({ start, end })

    // getDay: 0=日,1=一...6=六 → 我们以周一起始，日=6
    const firstDow = getDay(start) // 0-6
    const leadEmpty = firstDow === 0 ? 6 : firstDow - 1 // 周一前空格数

    const cells: (Date | null)[] = [
      ...Array(leadEmpty).fill(null),
      ...days,
    ]
    // 补齐到完整行
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewMonth])

  const monthLabel = language === 'zh'
    ? format(viewMonth, 'yyyy年 M月')
    : format(viewMonth, 'MMMM yyyy')

  const selectedDateObj = useMemo(() => {
    try { return parseISO(selectedDate) } catch { return new Date() }
  }, [selectedDate])

  return (
    <div
      className="rounded-2xl p-3 select-none"
      style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
    >
      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-2">
        <button
          className="w-6 h-6 flex items-center justify-center rounded-full transition-opacity active:opacity-60"
          style={{ color: theme.secondary }}
          onClick={() => setViewMonth(m => subMonths(m, 1))}
        >
          <ChevronLeft size={14} />
        </button>

        <span className="text-sm font-semibold" style={{ color: theme.text }}>
          {monthLabel}
        </span>

        <button
          className="w-6 h-6 flex items-center justify-center rounded-full transition-opacity active:opacity-60"
          style={{ color: theme.secondary }}
          onClick={() => setViewMonth(m => addMonths(m, 1))}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 星期行 */}
      <div className="grid grid-cols-7 mb-0.5">
        {weekDays.map(d => (
          <div
            key={d}
            className="flex items-center justify-center h-5 text-[10px] font-medium"
            style={{ color: theme.mutedText }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* 日期格子 */}
      <div className="grid grid-cols-7 gap-y-0">
        {calendarCells.map((day, idx) => {
          if (!day) {
            return <div key={`empty-${idx}`} className="h-8" />
          }

          const dateStr = format(day, 'yyyy-MM-dd')
          const hasDiary = diaryDates.has(dateStr)
          const isSelected = isSameDay(day, selectedDateObj)
          const isTodayDate = isToday(day)

          return (
            <button
              key={dateStr}
              className="relative flex flex-col items-center justify-center h-8 rounded-lg transition-all active:scale-90"
              style={{
                background: isSelected ? theme.accent : 'transparent',
                color: isSelected
                  ? '#fff'
                  : isTodayDate
                    ? theme.accent
                    : theme.text,
                fontWeight: isTodayDate || isSelected ? 600 : 400,
              }}
              onClick={() => onSelectDate(dateStr)}
            >
              <span className="text-xs leading-none">{day.getDate()}</span>

              {/* 有日记的小圆点 */}
              {hasDiary && (
                <span
                  className="absolute bottom-0.5 w-1 h-1 rounded-full"
                  style={{
                    background: isSelected ? 'rgba(255,255,255,0.8)' : theme.accent,
                  }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
