# VoxLog APK 打包指南

## 前提条件
- Node.js 18+（已在项目中安装好所有依赖）
- 不需要 Android Studio / Android SDK

---

## 第一步：在本机执行（约 5 分钟）

```bash
# 1. 进入项目根目录
cd <你的项目目录>

# 2. 构建前端（生成 dist/ 文件夹）
npm run build

# 3. 初始化 Android 平台（只需执行一次）
npx cap add android

# 4. 配置 Android 权限
bash scripts/setup-android.sh

# 5. 把 dist/ 同步到 Android 项目
npx cap sync android
```

执行完毕后，项目根目录会出现 `android/` 文件夹。

---

## 第二步：Ionic Appflow 云打包（约 3 分钟，无需 Android SDK）

1. 打开 https://ionic.io/appflow，注册免费账号
2. 点击「New App」→「Import existing app」
3. 将整个项目（含 `android/` 和 `capacitor.config.ts`）打包为 ZIP 上传
4. 选择「Build」→「Android」→「Debug」（测试用）或「Release」
5. 点击「Start Build」，等待约 3 分钟
6. 构建完成后下载 `.apk` 文件，传到手机安装即可

> **免费版限制**：每月 100 次构建额度，个人测试完全够用

---

## 第三步：安装到手机

1. 将 APK 文件通过 USB / 微信 / 网盘传到 Android 手机
2. 手机设置 →「安全」→ 开启「允许安装未知来源应用」
3. 点击 APK 文件安装
4. 首次启动时，系统会弹出麦克风权限申请，点击「允许」

---

## 功能适配说明

| 功能 | APK 表现 |
|------|----------|
| 语音录入 | ✅ 调用系统原生语音识别，中文/英文均支持 |
| AI 整理日记 | ✅ 通过网络调用，需要有效 API Key |
| 日记存储 | ✅ 数据保存在 App 私有沙盒，卸载前永久保留 |
| 导出 ZIP 备份 | ✅ 保存到手机「文件管理器 → 内部存储 → Android/data/com.voxlog.app/files」|
| 激活码验证 | ✅ 调用 Supabase，需要网络连接 |
| 主题 / 语言切换 | ✅ 完全正常 |

---

## 常见问题

**Q：打包后录音没有声音？**
A：检查 `scripts/setup-android.sh` 是否成功执行，确认 `AndroidManifest.xml` 含 `RECORD_AUDIO` 权限。

**Q：找不到导出的 ZIP？**
A：文件保存路径：文件管理器 → 内部存储 → `Android/data/com.voxlog.app/files/`

**Q：AI 整理失败？**
A：确认设置页中已填写有效的 API Key，或检查网络连接。

**Q：Appflow 免费版构建失败？**
A：确认 `android/` 目录已正确生成（`npx cap add android` 必须在本机执行）。
