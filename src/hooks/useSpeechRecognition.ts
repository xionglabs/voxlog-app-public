/**
 * useSpeechRecognition
 * 统一封装语音识别：
 *   - Android (Capacitor)：优先调用原生 @capacitor-community/speech-recognition
 *     原生不可用（如缺少 Google 语音服务）时自动 fallback 到 Web Speech API
 *   - Web / iOS PWA：使用 Web Speech API (webkitSpeechRecognition)
 *   - 两者都不支持：返回 supported=false，提示用户用文字输入
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'

// ── Web Speech API 类型声明 ─────────────────────────────
interface IWebSR {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
declare global {
  interface Window {
    SpeechRecognition: new () => IWebSR
    webkitSpeechRecognition: new () => IWebSR
  }
}

// 原生插件动态引入（仅 Capacitor 环境实际执行）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let nativeSpeech: any = null
let nativeLoaded = false

// 异步加载原生插件，返回 Promise 以便等待加载完成
async function loadNativeSpeech(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  if (nativeLoaded) return !!nativeSpeech
  try {
    const m = await import('@capacitor-community/speech-recognition')
    nativeSpeech = m.SpeechRecognition
    nativeLoaded = true
    return true
  } catch {
    nativeLoaded = true
    return false
  }
}

// 检测 Web Speech API 是否可用
function hasWebSpeech(): boolean {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

// ── Hook 参数 ──────────────────────────────────────────
interface Options {
  language: 'zh' | 'en'
  onResult: (transcript: string) => void
  onError?: (msg: string) => void
}

// ── Hook 返回值 ────────────────────────────────────────
interface Return {
  supported: boolean       // 是否支持语音识别（原生或 Web）
  isRecording: boolean
  interimText: string      // 实时转写
  startListening: () => Promise<void>
  stopListening: () => Promise<void>
}

export function useSpeechRecognition({ language, onResult, onError }: Options): Return {
  const isNative = Capacitor.isNativePlatform()

  const [supported, setSupported] = useState(true)
  const [isRecording, setIsRecording] = useState(false)
  const [interimText, setInterimText] = useState('')

  // Web 模式引用
  const webSRRef = useRef<IWebSR | null>(null)
  const finalRef = useRef('')

  // 检测支持情况（异步，等原生插件加载完）
  useEffect(() => {
    let cancelled = false
    async function detect() {
      const hasNative = await loadNativeSpeech()
      if (cancelled) return
      if (!hasNative && !hasWebSpeech()) {
        setSupported(false)
      }
    }
    detect()
    return () => { cancelled = true }
  }, [])

  // ── Web Speech API 开始录音（原生/Web 共用逻辑）─────────────────
  const startWebSpeech = useCallback(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      setSupported(false)
      onError?.('当前设备不支持语音识别，请用文字输入')
      return
    }

    // Android WebView 中 Web Speech API 需要先请求麦克风权限
    if (Capacitor.isNativePlatform()) {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        onError?.('请在系统设置中允许麦克风权限')
        return
      }
    }

    finalRef.current = ''
    setInterimText('')
    setIsRecording(true)

    const recognition = new SR()
    recognition.lang = language === 'zh' ? 'zh-CN' : 'en-US'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let final = finalRef.current
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript
        else interim += event.results[i][0].transcript
      }
      finalRef.current = final
      setInterimText(interim)
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        onError?.('麦克风权限被拒绝，请在系统设置中允许麦克风权限')
      } else if (event.error !== 'aborted') {
        onError?.('语音识别错误：' + event.error)
      }
      setIsRecording(false)
      setInterimText('')
    }

    recognition.onend = () => {
      setIsRecording(false)
      setInterimText('')
      if (finalRef.current.trim()) onResult(finalRef.current.trim())
    }

    webSRRef.current = recognition
    try {
      recognition.start()
    } catch {
      setIsRecording(false)
      onError?.('语音识别启动失败，请用文字输入')
    }
  }, [language, onResult, onError])

  // ── 原生平台开始录音（失败自动 fallback Web）─────────────────
  const startNative = useCallback(async () => {
    const hasNative = await loadNativeSpeech()
    if (!hasNative || !nativeSpeech) {
      // 原生不可用，fallback 到 Web Speech API
      await startWebSpeech()
      return
    }

    try {
      // 申请麦克风权限
      const { speechRecognition } = await nativeSpeech.checkPermissions()
      if (speechRecognition !== 'granted') {
        const result = await nativeSpeech.requestPermissions()
        if (result.speechRecognition !== 'granted') {
          onError?.('请在设置中允许麦克风权限')
          return
        }
      }

      setIsRecording(true)
      setInterimText('')

      await nativeSpeech.start({
        language: language === 'zh' ? 'zh-CN' : 'en-US',
        maxResults: 1,
        prompt: language === 'zh' ? '说出你今天的日记' : 'Speak your diary',
        partialResults: true,
        popup: false,
      })

      // 监听实时结果
      await nativeSpeech.addListener('partialResults', (data: { matches: string[] }) => {
        if (data.matches?.[0]) setInterimText(data.matches[0])
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      // 原生失败（如 "Speech recognition service is not available"），自动 fallback
      if (msg.includes('Speech recognition') || msg.includes('not available')) {
        setIsRecording(false)
        await startWebSpeech()
        return
      }
      onError?.(msg)
      setIsRecording(false)
    }
  }, [language, onError, startWebSpeech])

  // ── 原生平台停止录音 ─────────────────────────────────
  const stopNative = useCallback(async () => {
    if (nativeSpeech && nativeLoaded) {
      try {
        const result = await nativeSpeech.stop()
        const transcript = result?.matches?.[0] || interimText || ''
        setIsRecording(false)
        setInterimText('')
        await nativeSpeech.removeAllListeners()
        if (transcript.trim()) onResult(transcript.trim())
        return
      } catch {
        // 原生 stop 失败，继续用 Web 方式停止
      }
    }
    // fallback：用 Web 方式停止
    webSRRef.current?.stop()
    setIsRecording(false)
    setInterimText('')
  }, [interimText, onResult])

  // ── Web 平台停止录音 ──────────────────────────────────
  const stopWeb = useCallback(async () => {
    webSRRef.current?.stop()
  }, [])

  return {
    supported,
    isRecording,
    interimText,
    startListening: isNative ? startNative : startWebSpeech,
    stopListening: isNative ? stopNative : stopWeb,
  }
}
