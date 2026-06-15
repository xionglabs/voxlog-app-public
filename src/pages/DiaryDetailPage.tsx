import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Edit2, Save, Trash2, Share2, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/contexts/AppContext'
import { loadDiary, saveDiary, deleteDiary } from '@/utils/storage'
import type { DiaryEntry } from '@/types/voxlog'
import { exportDiary } from '@/utils/export'
import { format, parseISO } from 'date-fns'

export default function DiaryDetailPage() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { theme, t, config } = useApp()

  const isCreating = searchParams.get('create') === 'true'

  const [entry, setEntry] = useState<DiaryEntry | null>(null)
  const [isEditing, setIsEditing] = useState(isCreating)
  const [showExport, setShowExport] = useState(false)
  const [exportLoading, setExportLoading] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!date) return
    const d = loadDiary(date)
    setEntry(d)
    if (!d && isCreating) {
      // 创建模式：预填模板
      const template = date
        ? `【日期】${date}\n【天气】\n【今日记录】\n\n【每日新知】\n\n【今日备忘】\n`
        : ''
      // 延迟设置让 ref 可用
      setTimeout(() => {
        if (textareaRef.current) textareaRef.current.value = template
      }, 0)
    }
  }, [date, isCreating])

  function handleSave() {
    if (!date) return
    const text = textareaRef.current?.value || ''
    if (!text.trim()) {
      toast.warning(config.language === 'zh' ? '日记内容不能为空' : 'Diary content cannot be empty')
      return
    }
    const now = Date.now()
    if (entry) {
      const updated: DiaryEntry = { ...entry, content: text, updatedAt: now }
      saveDiary(updated)
      setEntry(updated)
      setIsEditing(false)
      toast.success(t.saveSuccess)
    } else {
      const newEntry: DiaryEntry = {
        date,
        content: text,
        createdAt: now,
        updatedAt: now,
      }
      saveDiary(newEntry)
      setEntry(newEntry)
      setIsEditing(false)
      toast.success(config.language === 'zh' ? '日记已创建' : 'Diary created')
    }
  }

  function handleDelete() {
    if (!date) return
    deleteDiary(date)
    toast.success(t.deleteSuccess)
    navigate('/list')
  }

  async function handleExport(format: 'md' | 'pdf' | 'word' | 'image') {
    if (!entry) return

    // 权限检查
    if (format === 'pdf' || format === 'word') {
      if (config.memberLevel === 'free') {
        toast.error(config.language === 'zh' ? '导出 PDF/Word 需要会员' : 'Export PDF/Word requires membership')
        return
      }
    }

    setExportLoading(format)
    try {
      const savedPath = await exportDiary(format, entry, config.theme, config.memberLevel, config.language)
      const pathMsg = config.language === 'zh'
        ? `已保存到：${savedPath || '下载文件夹'}`
        : `Saved to: ${savedPath || 'Downloads'}`
      toast.success(`${t.exportSuccess}\n${pathMsg}`, { duration: 4000 })
    } catch (err) {
      console.error('导出失败:', err)
      toast.error(config.language === 'zh' ? '导出失败，请重试' : 'Export failed')
    } finally {
      setExportLoading(null)
      setShowExport(false)
    }
  }

  const displayDate = date
    ? (config.language === 'zh'
        ? format(parseISO(date), 'yyyy年M月d日')
        : format(parseISO(date), 'MMMM d, yyyy'))
    : ''

  const exportOptions = [
    { id: 'md' as const, label: t.exportMd, desc: t.exportMdDesc, free: true },
    { id: 'image' as const, label: t.exportImage, desc: `${t.exportImageDesc}${config.memberLevel === 'free' ? ` (${t.watermarkNote})` : ''}`, free: true },
    { id: 'pdf' as const, label: t.exportPdf, desc: t.exportPdfDesc, free: false },
    { id: 'word' as const, label: t.exportWord, desc: t.exportWordDesc, free: false },
  ]

  // entry 为 null 且非创建模式时，提示可创建
  if (!entry && !isEditing) {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center gap-6" style={{ background: theme.bg }}>
        <p style={{ color: theme.mutedText }}>
          {config.language === 'zh' ? `${displayDate} 暂无记录` : `No diary on ${displayDate}`}
        </p>
        <button
          type="button"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium active:opacity-80 transition-opacity"
          style={{ background: theme.accent, color: '#fff' }}
          onClick={() => setIsEditing(true)}
        >
          <Plus size={16} />
          {config.language === 'zh' ? '新建日记' : 'New Diary'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: theme.bg, color: theme.text }}>
      {/* 顶部导航 */}
      <div
        className="flex items-center justify-between px-4 pt-4 pb-4 sticky top-0 z-10"
        style={{ background: theme.bg }}
      >
        <button
          className="flex items-center gap-1.5 py-2 pr-3 active:opacity-70"
          style={{ color: theme.secondary }}
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={20} />
        </button>

        <span className="text-sm font-medium" style={{ color: theme.text }}>{displayDate}</span>

        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button
                className="p-2 rounded-xl active:opacity-70"
                style={{ color: theme.mutedText }}
                onClick={() => {
                  setIsEditing(false)
                  if (textareaRef.current) textareaRef.current.value = entry?.content || ''
                }}
              >
                <X size={18} />
              </button>
              <button
                className="p-2 rounded-xl active:opacity-70"
                style={{ color: theme.accent }}
                onClick={handleSave}
              >
                <Save size={18} />
              </button>
            </>
          ) : (
            <>
              <button
                className="p-2 rounded-xl active:opacity-70"
                style={{ color: theme.secondary }}
                onClick={() => setShowExport(true)}
              >
                <Share2 size={18} />
              </button>
              <button
                className="p-2 rounded-xl active:opacity-70"
                style={{ color: theme.secondary }}
                onClick={() => setIsEditing(true)}
              >
                <Edit2 size={18} />
              </button>
              <button
                className="p-2 rounded-xl active:opacity-70"
                style={{ color: '#ef4444' }}
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 px-6 pb-safe pb-16">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            autoFocus
            className="w-full resize-none text-sm leading-relaxed bg-transparent outline-none"
            style={{ color: theme.text, minHeight: '60vh' }}
            defaultValue={entry?.content || ''}
          />
        ) : (
          <div className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: theme.text }}>
            {entry.content.split('\n').map((line, i) => {
              const isTag = line.startsWith('【') && line.includes('】')
              return (
                <div
                  key={i}
                  style={{
                    color: isTag ? theme.accent : theme.text,
                    fontWeight: isTag ? 600 : 400,
                    marginTop: isTag && i > 0 ? '20px' : '0',
                    marginBottom: '4px',
                  }}
                >
                  {line || '\u00A0'}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 导出面板 */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-end p-4 pb-6" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div
            className="w-full rounded-3xl p-6"
            style={{ background: theme.cardBg }}
          >
            <div className="flex items-center justify-between mb-5">
              <span className="text-base font-semibold" style={{ color: theme.text }}>{t.exportDiary}</span>
              <button onClick={() => setShowExport(false)} style={{ color: theme.mutedText }}>
                <X size={20} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {exportOptions.map(opt => (
                <button
                  key={opt.id}
                  className="flex items-center justify-between p-4 rounded-xl active:opacity-70 transition-opacity"
                  style={{
                    background: theme.inputBg,
                    border: `1px solid ${theme.border}`,
                    opacity: exportLoading && exportLoading !== opt.id ? 0.5 : 1,
                  }}
                  onClick={() => handleExport(opt.id)}
                  disabled={exportLoading !== null}
                >
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: theme.text }}>{opt.label}</span>
                      {!opt.free && config.memberLevel === 'free' && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ background: theme.accent + '20', color: theme.accent }}
                        >
                          {t.memberOnly}
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5 text-pretty" style={{ color: theme.mutedText }}>{opt.desc}</p>
                  </div>
                  {exportLoading === opt.id && (
                    <div className="w-4 h-4 border-2 rounded-full animate-spin"
                      style={{ borderColor: `${theme.accent} transparent transparent transparent` }} />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="w-full max-w-xs rounded-2xl p-6" style={{ background: theme.cardBg }}>
            <p className="text-sm text-center mb-5" style={{ color: theme.text }}>{t.deleteConfirm}</p>
            <div className="flex gap-3">
              <button
                className="flex-1 py-2.5 rounded-xl text-sm"
                style={{ border: `1px solid ${theme.border}`, color: theme.secondary }}
                onClick={() => setShowDeleteConfirm(false)}
              >
                {t.cancel}
              </button>
              <button
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: '#ef4444', color: '#fff' }}
                onClick={handleDelete}
              >
                {t.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
