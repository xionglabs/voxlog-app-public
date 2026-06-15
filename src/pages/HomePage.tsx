import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mic, Keyboard, Loader2, ChevronRight, Sparkles, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/contexts/AppContext'
import { saveDiary, getTodayDate, loadDiary, getDiaryIndex } from '@/utils/storage'
import { aiOrganize } from '@/utils/aiClient'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import type { DiaryEntry } from '@/types/voxlog'
import { format, parseISO, isToday as dateFnsIsToday } from 'date-fns'
import DiaryCalendar from '@/components/DiaryCalendar'


/** 生成日记模板（中英文） */
function buildTemplate(date: string, lang: 'zh' | 'en'): string {
  if (lang === 'en') {
    return `[Date] ${date}
[Weather] 
[Today's Notes]
(write here)
[New Things Learned]

[Reminders]
`
  }
  return `【日期】${date}
【天气】
【今日记录】
（在这里写今天发生的事…）
【每日新知】

【今日备忘】
`
}

export default function HomePage() {
  const { config, theme, t, todayDiary, refreshTodayDiary, remainingAiCount, consumeAiCount } = useApp()
  const navigate = useNavigate()

  const today = getTodayDate()

  const [isProcessing, setIsProcessing] = useState(false)
  const [showTextInput, setShowTextInput] = useState(false)
  const [textInputValue, setTextInputValue] = useState('')
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedDiaryContent, setSelectedDiaryContent] = useState<DiaryEntry | null>(todayDiary)
  const [diaryDates, setDiaryDates] = useState<Set<string>>(() => new Set(getDiaryIndex()))

  const isHoldingRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // ── AI 整理（语音/文字共用）────────────────────────
  const handleAiOrganize = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return

    if (!consumeAiCount()) {
      toast.error(t.aiLimitReached)
      return
    }

    setIsProcessing(true)
    const existing = loadDiary(today)

    try {
      const organizedContent = await aiOrganize({
        transcript,
        existingContent: existing?.content || '',
        date: today,
        customApiKey: config.customApiKey || undefined,
        customBaseUrl: config.customBaseUrl || undefined,
        customModel: config.customModel || undefined,
      })

      if (!organizedContent) throw new Error('AI 返回内容为空')

      const now = Date.now()
      const entry: DiaryEntry = {
        date: today,
        content: organizedContent,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      }
      saveDiary(entry)
      refreshTodayDiary()
      if (selectedDate === today) setSelectedDiaryContent(entry)
      setDiaryDates(new Set(getDiaryIndex()))
      toast.success(config.language === 'zh' ? 'AI 整理完成，已保存' : 'AI organized and saved')
    } catch (err: unknown) {
      console.error('AI 整理失败:', err)
      const errMsg = err instanceof Error ? err.message : String(err)
      const now = Date.now()
      const fallbackContent = existing
        ? `${existing.content}\n\n---\n${transcript}`
        : buildTemplate(today, config.language).replace(
            config.language === 'zh' ? '（在这里写今天发生的事…）' : '(write here)',
            transcript,
          )
      const fallback: DiaryEntry = { date: today, content: fallbackContent, createdAt: existing?.createdAt || now, updatedAt: now }
      saveDiary(fallback)
      refreshTodayDiary()
      if (selectedDate === today) setSelectedDiaryContent(fallback)
      setDiaryDates(new Set(getDiaryIndex()))
      toast.warning(config.language === 'zh'
        ? `AI 服务不可用，已保存原文（${errMsg}）`
        : `AI unavailable, raw text saved (${errMsg})`)
    } finally {
      setIsProcessing(false)
    }
  }, [config, consumeAiCount, refreshTodayDiary, t, today, selectedDate])

  // ── 语音识别 hook ────────────────────────────────────
  const { supported: speechSupported, isRecording, interimText, startListening, stopListening } = useSpeechRecognition({
    language: config.language,
    onResult: handleAiOrganize,
    onError: (msg) => toast.error(msg || t.speechNotSupported),
  })

  // 今日日记同步
  useEffect(() => {
    if (selectedDate === today) setSelectedDiaryContent(todayDiary)
    setDiaryDates(new Set(getDiaryIndex()))
  }, [todayDiary, selectedDate, today])

  // 打开文字输入框，预填模板或已有内容
  const openTextInput = useCallback(() => {
    const existing = loadDiary(today)
    const initial = existing?.content || buildTemplate(today, config.language)
    setTextInputValue(initial)
    setShowTextInput(true)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      const placeholder = config.language === 'zh' ? '（在这里写今天发生的事…）' : '(write here)'
      const idx = initial.indexOf(placeholder)
      if (idx !== -1) ta.setSelectionRange(idx, idx + placeholder.length)
      else ta.setSelectionRange(initial.length, initial.length)
    })
  }, [today, config.language])

  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date)
    setSelectedDiaryContent(loadDiary(date))
  }, [])

  const isSelectedToday = selectedDate === today
  const isSelectedTodayDate = dateFnsIsToday(parseISO(selectedDate))

  // 长按麦克风：开始录音
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    if (isProcessing) return
    if (!speechSupported) { openTextInput(); return }
    isHoldingRef.current = true
    startListening()
  }, [isProcessing, speechSupported, openTextInput, startListening])

  // 松开：停止录音，结果由 hook 回调 onResult → handleAiOrganize
  const handlePointerUp = useCallback(() => {
    if (!isHoldingRef.current) return
    isHoldingRef.current = false
    stopListening()
  }, [stopListening])

  // 文字输入提交：直接保存，不经过 AI
  const handleTextSubmit = useCallback(() => {
    const text = textInputValue.trim()
    if (!text) return
    // 判断是否是纯模板（未做任何修改），提示先填写
    const emptyZh = buildTemplate(today, 'zh')
    const emptyEn = buildTemplate(today, 'en')
    if (text === emptyZh.trim() || text === emptyEn.trim()) {
      toast.warning(config.language === 'zh' ? '请先填写日记内容再保存' : 'Please fill in the diary first')
      return
    }
    const existing = loadDiary(today)
    const now = Date.now()
    const entry: DiaryEntry = {
      date: today,
      content: text,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    }
    saveDiary(entry)
    refreshTodayDiary()
    if (selectedDate === today) setSelectedDiaryContent(entry)
    setDiaryDates(new Set(getDiaryIndex()))
    setShowTextInput(false)
    setTextInputValue('')
    toast.success(config.language === 'zh' ? '日记已保存' : 'Diary saved')
  }, [textInputValue, today, config.language, selectedDate, refreshTodayDiary])

  const selectedDateLabel = useMemo(() => {
    try {
      const d = parseISO(selectedDate)
      return config.language === 'zh' ? format(d, 'M月d日') : format(d, 'MMM d')
    } catch { return '' }
  }, [selectedDate, config.language])

  return (
    <div
      className="flex flex-col min-h-screen overflow-y-auto"
      style={{ background: theme.bg, color: theme.text }}
    >
      {/* ── 顶部标题区 ── */}
      <div className="px-5 pt-6 pb-3 flex items-end justify-between">
        <div>
          <div className="text-xs mb-1" style={{ color: theme.mutedText }}>
            {format(new Date(), config.language === 'zh' ? 'yyyy年M月d日' : 'MMMM d, yyyy')}
          </div>
          <h1 className="text-xl font-bold tracking-tight" style={{ color: theme.text }}>
            {t.appName}
          </h1>
        </div>
        <div
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
          style={{ background: `${theme.accent}18`, color: theme.accent }}
        >
          <Sparkles size={11} />
          <span>{remainingAiCount} {t.times}</span>
        </div>
      </div>

      {/* ── 日历区 ── */}
      <div className="px-5 pb-3">
        <DiaryCalendar
          diaryDates={diaryDates}
          selectedDate={selectedDate}
          language={config.language}
          theme={theme}
          onSelectDate={handleSelectDate}
        />
      </div>

      {/* ── 选中日记卡片区 ── */}
      <div className="px-5 pb-4">
        {selectedDiaryContent ? (
          <div
            className="rounded-2xl cursor-pointer active:opacity-80 transition-opacity"
            style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
            onClick={() => navigate(`/diary/${selectedDate}`)}
          >
            <div
              className="flex items-center justify-between px-4 py-2.5 rounded-t-2xl"
              style={{ borderBottom: `1px solid ${theme.border}` }}
            >
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: theme.accent }} />
                <span className="text-xs font-semibold" style={{ color: theme.accent }}>
                  {isSelectedTodayDate
                    ? t.todayDiary
                    : (config.language === 'zh' ? `${selectedDateLabel} 的日记` : `${selectedDateLabel} Diary`)}
                </span>
              </div>
              <ChevronRight size={14} style={{ color: theme.mutedText }} />
            </div>
            <div className="px-4 pt-3 pb-4">
              <p
                className="text-sm leading-relaxed line-clamp-5 whitespace-pre-wrap break-words"
                style={{ color: theme.secondary }}
              >
                {selectedDiaryContent.content}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl px-4 py-5 flex flex-col items-center gap-2"
            style={{ background: theme.cardBg, border: `1px dashed ${theme.border}` }}
          >
            <PenLine size={20} style={{ color: `${theme.mutedText}80` }} />
            <p className="text-sm text-center text-pretty" style={{ color: theme.mutedText }}>
              {isSelectedTodayDate
                ? t.noTodayDiary
                : (config.language === 'zh' ? `${selectedDateLabel} 暂无记录` : `No diary on ${selectedDateLabel}`)}
            </p>
          </div>
        )}
      </div>

      {/* ── 录音操作区（仅今天可录音） ── */}
      {isSelectedToday && (
        <>
          {/* 文字输入框（带模板） */}
          {showTextInput && (
            <div className="px-5 pb-3">
              <div
                className="rounded-2xl"
                style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
              >
                {/* 输入框顶栏 */}
                <div
                  className="flex items-center justify-between px-4 py-2.5 rounded-t-2xl"
                  style={{ borderBottom: `1px solid ${theme.border}` }}
                >
                  <span className="text-xs font-medium" style={{ color: theme.accent }}>
                    {config.language === 'zh' ? '✏️ 填写日记' : '✏️ Write Diary'}
                  </span>
                  <span className="text-xs" style={{ color: theme.mutedText }}>
                    {config.language === 'zh' ? '写完直接保存' : 'Save when done'}
                  </span>
                </div>
                <textarea
                  ref={textareaRef}
                  className="w-full resize-none text-sm leading-relaxed bg-transparent outline-none px-4 py-3"
                  style={{ color: theme.text, minHeight: '200px' }}
                  value={textInputValue}
                  onChange={e => setTextInputValue(e.target.value)}
                />
                <div
                  className="flex gap-2 px-4 py-3 justify-end"
                  style={{ borderTop: `1px solid ${theme.border}` }}
                >
                  <button
                    className="px-4 py-1.5 rounded-lg text-sm"
                    style={{ color: theme.mutedText, border: `1px solid ${theme.border}` }}
                    onClick={() => { setShowTextInput(false); setTextInputValue('') }}
                  >
                    {t.cancel}
                  </button>
                  <button
                    className="px-4 py-1.5 rounded-lg text-sm font-medium"
                    style={{
                      background: textInputValue.trim() ? theme.accent : theme.border,
                      color: textInputValue.trim() ? '#fff' : theme.mutedText,
                    }}
                    onClick={handleTextSubmit}
                    disabled={!textInputValue.trim()}
                  >
                    {config.language === 'zh' ? '保存' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 录音状态提示 */}
          {(isProcessing || isRecording || interimText) && (
            <div className="flex flex-col items-center gap-2 pb-3 px-5">
              {isProcessing && (
                <div className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: theme.accent }} />
                  <span className="text-xs" style={{ color: theme.accent }}>{t.aiProcessing}</span>
                </div>
              )}
              {isRecording && (
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#ef4444' }} />
                  <span className="text-xs" style={{ color: theme.secondary }}>{t.releaseToStop}</span>
                </div>
              )}
              {interimText && (
                <div
                  className="w-full px-4 py-2 rounded-xl text-sm text-center"
                  style={{ background: theme.cardBg, color: theme.secondary, border: `1px solid ${theme.border}` }}
                >
                  {interimText}
                </div>
              )}
            </div>
          )}

          {/* 主录音按钮 */}
          <div className="flex flex-col items-center pb-36 gap-3 pt-2">
            <div className="relative flex items-center justify-center">
              {isRecording && (
                <div
                  className="absolute rounded-full animate-ping opacity-20"
                  style={{ width: 96, height: 96, background: theme.accent }}
                />
              )}
              <button
                className="relative flex items-center justify-center rounded-full select-none cursor-pointer"
                style={{
                  width: 72,
                  height: 72,
                  background: isRecording ? theme.accent : theme.text,
                  color: theme.bg,
                  boxShadow: isRecording
                    ? `0 0 0 5px ${theme.accent}28`
                    : `0 4px 16px ${theme.text}22`,
                  transform: isRecording ? 'scale(0.94)' : 'scale(1)',
                  transition: 'all 0.15s ease',
                }}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                disabled={isProcessing}
              >
                {isProcessing
                  ? <Loader2 size={24} className="animate-spin" />
                  : <Mic size={24} />
                }
              </button>
            </div>

            <p className="text-xs" style={{ color: theme.mutedText }}>
              {isRecording ? t.releaseToStop : t.holdToSpeak}
            </p>

            {!isRecording && !isProcessing && (
              <button
                className="flex items-center gap-1.5 text-xs py-1.5 px-3.5 rounded-xl transition-opacity active:opacity-70"
                style={{ color: theme.secondary, border: `1px solid ${theme.border}` }}
                onClick={() => {
                  if (showTextInput) {
                    setShowTextInput(false)
                    setTextInputValue('')
                  } else {
                    openTextInput()
                  }
                }}
              >
                <Keyboard size={12} />
                {showTextInput ? t.cancel : t.typeInstead}
              </button>
            )}
          </div>
        </>
      )}

      {!isSelectedToday && <div className="pb-28" />}
    </div>
  )
}
