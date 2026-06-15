#!/usr/bin/env bash
# ============================================================
# VoxLog Android 权限配置脚本
# 使用方法：在项目根目录运行  bash scripts/setup-android.sh
# 前提：已执行 npx cap add android
# ============================================================

set -e

MANIFEST="android/app/src/main/AndroidManifest.xml"

if [ ! -f "$MANIFEST" ]; then
  echo "❌ 未找到 $MANIFEST，请先运行：npx cap add android"
  exit 1
fi

# ── 1. 注入权限（幂等：已存在则跳过）──────────────────────
inject_permission() {
  local perm="$1"
  if grep -q "$perm" "$MANIFEST"; then
    echo "  ✔ 已存在：$perm"
  else
    # 插入到第一个 <uses-permission 之前，或 <application 之前
    sed -i "s|<application|<uses-permission android:name=\"$perm\" />\n    <application|" "$MANIFEST"
    echo "  ✚ 已添加：$perm"
  fi
}

echo "📝 注入 Android 权限..."
inject_permission "android.permission.RECORD_AUDIO"
inject_permission "android.permission.INTERNET"
inject_permission "android.permission.READ_EXTERNAL_STORAGE"
inject_permission "android.permission.WRITE_EXTERNAL_STORAGE"
inject_permission "android.permission.ACCESS_NETWORK_STATE"

# ── 2. 检查 android:requestLegacyExternalStorage ──────────
if grep -q "requestLegacyExternalStorage" "$MANIFEST"; then
  echo "  ✔ 已存在：requestLegacyExternalStorage"
else
  sed -i 's|android:label=|android:requestLegacyExternalStorage="true"\n        android:label=|' "$MANIFEST"
  echo "  ✚ 已添加：requestLegacyExternalStorage"
fi

echo ""
echo "✅ AndroidManifest.xml 权限配置完成"
echo ""
echo "✅ 全部配置完成"
