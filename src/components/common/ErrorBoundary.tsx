import React from 'react'

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * 全局错误边界
 * 捕获任何渲染期间的未处理异常，防止白屏。
 * Android APK 调试时会在屏幕上显示错误详情，方便排查。
 */
export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo })
    console.error('[ErrorBoundary] 渲染错误：', error, errorInfo)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const { error, errorInfo } = this.state
    return (
      <div
        style={{
          padding: '24px 20px',
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)',
          background: '#1a1a1a',
          minHeight: '100vh',
          color: '#fff',
          fontFamily: 'monospace',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 700, color: '#ff6b6b', marginBottom: 12 }}>
          ⚠️ 应用启动错误
        </div>
        <div style={{ fontSize: 13, color: '#ffa', marginBottom: 8 }}>
          {error?.message}
        </div>
        {error?.stack && (
          <pre
            style={{
              fontSize: 11,
              color: '#aaa',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              background: '#111',
              padding: 12,
              borderRadius: 8,
              marginBottom: 8,
            }}
          >
            {error.stack}
          </pre>
        )}
        {errorInfo?.componentStack && (
          <pre
            style={{
              fontSize: 11,
              color: '#888',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              background: '#111',
              padding: 12,
              borderRadius: 8,
            }}
          >
            组件栈：{errorInfo.componentStack}
          </pre>
        )}
        <div
          style={{ marginTop: 20, fontSize: 12, color: '#666' }}
        >
          请截图此页面，发给开发者排查。
        </div>
      </div>
    )
  }
}
