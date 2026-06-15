import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Home, BookOpen, Search, BarChart2, Settings } from 'lucide-react'
import { useApp } from '@/contexts/AppContext'

export default function BottomNav() {
  const { theme, t } = useApp()
  const location = useLocation()
  const navigate = useNavigate()

  const tabs = [
    { path: '/', icon: Home, label: t.home },
    { path: '/list', icon: BookOpen, label: t.list },
    { path: '/search', icon: Search, label: t.search },
    { path: '/summary', icon: BarChart2, label: t.summary },
    { path: '/settings', icon: Settings, label: t.settings },
  ]

  // 隐藏底部导航的路由（日记详情页）
  const hideOn = ['/diary/']
  const shouldHide = hideOn.some(prefix => location.pathname.startsWith(prefix))
  if (shouldHide) return null

  const activeIdx = tabs.findIndex(tab => tab.path === location.pathname)

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 px-safe"
      style={{
        background: theme.cardBg,
        borderTop: `1px solid ${theme.border}`,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        paddingTop: '8px',
      }}
    >
      {/* 限宽容器，与页面一致 */}
      <div className="max-w-md mx-auto flex items-center justify-around px-2 relative">
        {/* 激活背景胶囊（滑块效果）*/}
        {activeIdx >= 0 && (
          <div
            className="absolute top-0 bottom-0 my-auto rounded-xl transition-all duration-300 ease-out pointer-events-none"
            style={{
              width: `${100 / tabs.length}%`,
              left: `${(activeIdx / tabs.length) * 100}%`,
              height: 44,
              background: `${theme.accent}14`,
            }}
          />
        )}

        {tabs.map((tab, idx) => {
          const isActive = idx === activeIdx
          return (
            <button
              key={tab.path}
              className="relative flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-12 min-h-11 justify-center active:opacity-70 transition-opacity flex-1"
              onClick={() => navigate(tab.path)}
            >
              <tab.icon
                size={20}
                style={{ color: isActive ? theme.accent : theme.mutedText }}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span
                className="text-[10px] leading-none"
                style={{
                  color: isActive ? theme.accent : theme.mutedText,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {tab.label}
              </span>
              {/* 底部激活圆点 */}
              <span
                className="absolute bottom-0.5 w-1 h-1 rounded-full transition-all duration-300"
                style={{
                  background: isActive ? theme.accent : 'transparent',
                }}
              />
            </button>
          )
        })}
      </div>
    </nav>
  )
}
