import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.voxlog.app',
  appName: 'VoxLog',
  webDir: 'dist',
  server: {
    // HTTPS scheme：让 localStorage / WebCrypto 在 Android WebView 中正常工作
    androidScheme: 'https',
  },
  android: {
    // 允许 WebView 访问 https 和 Supabase 接口
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true, // 调试期间开启，排查白屏问题后可改为 false
  },
  plugins: {
    SpeechRecognition: {
      // 原生语音识别，Android 调系统 ASR
    },
    Filesystem: {
      // 写入外部存储 Downloads 目录
    },
    StatusBar: {
      // 设置状态栏为非沉浸式，让 WebView 自动从状态栏下方开始渲染
      // 这样前端不需要自己猜测状态栏高度
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0F0F12',
    },
  },
}

export default config
