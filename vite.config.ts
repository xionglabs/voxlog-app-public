import { defineConfig } from "vite";
import { miaodaDevPlugin } from "miaoda-sc-plugin";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";

/**
 * 移除 Vite 生产构建自动添加的 crossorigin 属性。
 * Capacitor WebView 加载本地资源时，crossorigin 可能导致 CORS 预检失败，
 * 使 JS/CSS 无法加载，表现为白屏。
 */
const removeCrossoriginPlugin = () => ({
  name: "remove-crossorigin",
  transformIndexHtml(html: string) {
    return html.replace(/ crossorigin/g, "");
  },
});

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: './',   // 相对路径，Android WebView 本地文件加载时必须
  build: {
    // 降低目标到 ES2015，兼容旧版 Android WebView
    target: "es2015",
    // 禁用 module preload（避免生成额外的 crossorigin 属性）
    modulePreload: { polyfill: false },
  },
  plugins: [
    react(),
    // miaodaDevPlugin 只在秒哒预览（dev server）中启用。
    // 它包含五个注入插件：
    //   - dynamicRedirectPlugin：往 <head> 注入重定向脚本（依赖 iframe 环境）
    //   - fontsCodePlugin：注入百度 CDN 字体 link
    //   - mdClickPlugin：注入全局 document click 监听
    //   - injectOnErrorPlugin：注入 PerformanceObserver（Android WebView 可能不支持 resource type）
    //   - patchSupabasePlugin：在编译时修改 supabase.ts，将所有 Supabase 请求 URL
    //     改写为相对路径（为秒哒 iframe 代理设计），在 Android WebView 中
    //     这些请求会打到 https://localhost/ 导致全部失败，可能引发模块初始化崩溃（白屏）
    // 生产构建（APK）中不需要这些，移除后 Supabase 请求直接使用原始 URL，行为正确。
    ...(command === 'serve' ? [miaodaDevPlugin()] : []),
    removeCrossoriginPlugin(),
    svgr({
      svgrOptions: {
        icon: true,
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  // build 时强制禁用 Supabase URL 代理改写（双保险）
  // patchSupabasePlugin 会检测 VITE_SUPABASE_PROXY !== "false" 才改写 URL，
  // 设为 "false" 后即使插件意外在 build 时运行也不会修改请求地址。
  define: command === 'build' ? {
    'import.meta.env.VITE_SUPABASE_PROXY': JSON.stringify('false'),
  } : {},
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
