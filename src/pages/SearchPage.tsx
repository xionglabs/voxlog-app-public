import React, { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, ChevronRight } from 'lucide-react'
import { useApp } from '@/contexts/AppContext'
import { searchDiaries } from '@/utils/storage'
import type { SearchResult } from '@/types/voxlog'

export default function SearchPage() {
  const { theme, t, config } = useApp()
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searched, setSearched] = useState(false)

  const handleSearch = useCallback(() => {
    if (!keyword.trim()) return
    const res = searchDiaries(keyword.trim())
    setResults(res)
    setSearched(true)
  }, [keyword])

  const handleClear = () => {
    setKeyword('')
    setResults([])
    setSearched(false)
  }

  function highlight(text: string, kw: string): React.ReactNode {
    if (!kw.trim()) return text
    const parts = text.split(new RegExp(`(${kw})`, 'gi'))
    return parts.map((part, i) =>
      part.toLowerCase() === kw.toLowerCase()
        ? <mark key={i} style={{ background: `${theme.accent}40`, color: theme.text, borderRadius: '2px', padding: '0 1px' }}>{part}</mark>
        : part
    )
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: theme.bg, color: theme.text }}>
      <div className="px-5 pt-safe pt-6 pb-4">
        <h1 className="text-xl font-bold mb-4" style={{ color: theme.text }}>{t.search}</h1>

        {/* 搜索输入框 */}
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
        >
          <Search size={16} style={{ color: theme.mutedText, flexShrink: 0 }} />
          <input
            className="flex-1 bg-transparent text-sm outline-none min-w-0"
            style={{ color: theme.text }}
            placeholder={t.searchPlaceholder}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === 'Go' || e.key === 'Search' || e.key === 'Done') {
                e.preventDefault()
                handleSearch()
              }
            }}
          />
          {keyword && (
            <button onClick={handleClear} style={{ color: theme.mutedText, flexShrink: 0 }}>
              <X size={16} />
            </button>
          )}
        </div>

        <button
          className="w-full mt-3 py-3.5 rounded-2xl text-sm font-medium active:opacity-80 transition-opacity min-h-12"
          style={{
            background: keyword.trim() ? theme.text : theme.border,
            color: keyword.trim() ? theme.bg : theme.mutedText,
          }}
          onClick={handleSearch}
          disabled={!keyword.trim()}
        >
          {t.search}
        </button>
      </div>

      {/* 搜索结果 */}
      <div className="flex-1 px-4 pb-safe pb-12">
        {searched && (
          <div className="mb-3 px-2">
            <span className="text-sm" style={{ color: theme.mutedText }}>
              {results.length > 0
                ? (config.language === 'zh' ? `找到 ${results.length} 篇日记` : `Found ${results.length} entries`)
                : t.noResults
              }
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {results.map(result => (
            <button
              key={result.date}
              className="w-full text-left rounded-2xl p-5 active:opacity-80 transition-opacity"
              style={{ background: theme.cardBg, border: `1px solid ${theme.border}` }}
              onClick={() => navigate(`/diary/${result.date}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold mb-1.5" style={{ color: theme.accent }}>
                    {result.date}
                    <span className="ml-2 text-xs font-normal" style={{ color: theme.mutedText }}>
                      {config.language === 'zh' ? `${result.matchCount} 处匹配` : `${result.matchCount} match(es)`}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-pretty" style={{ color: theme.secondary }}>
                    {highlight(result.excerpt, keyword)}
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 mt-0.5" style={{ color: theme.mutedText }} />
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
