import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import ErrorBoundary from "./components/common/ErrorBoundary.tsx";
import { Capacitor } from "@capacitor/core";

// ── 隐藏初始加载诊断层 ──
const hideLoadingDiag = () => {
  const d = document.getElementById("loading-diag");
  if (d) d.classList.add("hidden");
};

// ── 全局兜底错误捕获（模块加载阶段 / React 挂载前的崩溃）──────────────────
// ErrorBoundary 只能捕获 React 组件树内的错误。
// 如果某个 import 模块的顶层代码同步抛出异常，React 根本不会挂载，
// 屏幕只是白屏，没有任何提示，极难调试。
// 这里用 window.onerror 兜底：把错误渲染到 DOM，即使 React 没有起来也能看到。
window.onerror = (message, source, lineno, colno, error) => {
  hideLoadingDiag();
  const root = document.getElementById("root");
  if (!root) return false;
  const stack = error?.stack || String(message);
  root.innerHTML = `
    <div style="padding:24px 20px;padding-top:calc(env(safe-area-inset-top,0px)+24px);
      background:#1a1a1a;min-height:100vh;color:#fff;font-family:monospace;box-sizing:border-box">
      <div style="font-size:20px;font-weight:700;color:#ff6b6b;margin-bottom:12px">
        ⚠️ 启动错误（window.onerror）
      </div>
      <div style="font-size:13px;color:#ffa;margin-bottom:8px">${String(message)}</div>
      <pre style="font-size:11px;color:#aaa;overflow-x:auto;white-space:pre-wrap;
        word-break:break-all;background:#111;padding:12px;border-radius:8px;margin-bottom:8px">
${stack}
      </pre>
      <div style="margin-top:8px;font-size:11px;color:#888">
        来源：${source || '?'} 行 ${lineno}:${colno}
      </div>
      <div style="margin-top:16px;font-size:12px;color:#666">请截图发给开发者排查。</div>
    </div>`;
  return true; // 阻止浏览器默认的控制台输出
};

// ── 未处理的 Promise rejection 也捕获 ────────────────────
window.addEventListener("unhandledrejection", (event) => {
  hideLoadingDiag();
  window.onerror?.(
    `Unhandled Promise rejection: ${event.reason}`,
    undefined, 0, 0,
    event.reason instanceof Error ? event.reason : new Error(String(event.reason))
  );
});

// ── Android 沉浸式状态栏（Edge-to-Edge）──────────────────
// 让 WebView 延伸到状态栏下方绘制，CSS 里用 env(safe-area-inset-top) 补偿高度
// 必须在 React 挂载前调用，否则布局抖动
if (Capacitor.isNativePlatform()) {
  import("@capacitor/status-bar").then(({ StatusBar, Style }) => {
    StatusBar.setOverlaysWebView({ overlay: true });
    // 根据主题决定状态栏图标颜色，默认 Dark（深色图标，适配浅色背景）
    StatusBar.setStyle({ style: Style.Dark });
  }).catch(() => {
    // 插件不可用时静默忽略，不影响主功能
  });
}

try {
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <AppWrapper>
        <App />
      </AppWrapper>
    </ErrorBoundary>
  );
} catch (e) {
  // createRoot 本身失败时的兜底（极罕见，但确保不白屏）
  const root = document.getElementById("root");
  if (root) {
    const err = e instanceof Error ? e : new Error(String(e));
    root.innerHTML = `
      <div style="padding:24px 20px;padding-top:calc(env(safe-area-inset-top,0px)+24px);
        background:#1a1a1a;min-height:100vh;color:#fff;font-family:monospace;box-sizing:border-box">
        <div style="font-size:20px;font-weight:700;color:#ff6b6b;margin-bottom:12px">
          ⚠️ 启动错误（createRoot 失败）
        </div>
        <div style="font-size:13px;color:#ffa;margin-bottom:8px">${err.message}</div>
        <pre style="font-size:11px;color:#aaa;overflow-x:auto;white-space:pre-wrap;
          word-break:break-all;background:#111;padding:12px;border-radius:8px">
${err.stack}
        </pre>
        <div style="margin-top:16px;font-size:12px;color:#666">请截图发给开发者排查。</div>
      </div>`;
  }
}
