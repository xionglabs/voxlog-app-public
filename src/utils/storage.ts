import type { DiaryEntry, AppConfig, SearchResult, SummaryRecord, SummaryPeriod } from '@/types/voxlog'
import { DEFAULT_CONFIG } from '@/constants/themes'
import { format } from 'date-fns'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const STORAGE_KEYS = {
  CONFIG: 'voxlog_config',
  DIARY_PREFIX: 'voxlog_diary_',
  DIARY_INDEX: 'voxlog_diary_index',
  SUMMARY_LIST: 'voxlog_summary_list',   // 存储所有总结记录
}

/** 原生平台 Preferences 备份 key */
const PREF_BACKUP_KEY = 'voxlog_config_backup'

/** 是否原生平台 */
const isNative = () => Capacitor.isNativePlatform()

/** 备份配置到 Preferences（卸载保留） */
async function backupConfigToPrefs(config: AppConfig): Promise<void> {
  if (!isNative()) return
  try {
    await Preferences.set({ key: PREF_BACKUP_KEY, value: JSON.stringify(config) })
  } catch (e) {
    console.warn('Preferences 备份失败:', e)
  }
}

/** 从 Preferences 恢复配置（覆盖安装时 localStorage 可能丢失） */
async function restoreConfigFromPrefs(): Promise<AppConfig | null> {
  if (!isNative()) return null
  try {
    const { value } = await Preferences.get({ key: PREF_BACKUP_KEY })
    if (!value) return null
    const config = { ...DEFAULT_CONFIG, ...JSON.parse(value) }
    // 旧版本数据迁移
    if (config.memberLevel !== 'free' && config.memberExpiresAt < 0) {
      config.memberExpiresAt = 0
    }
    return config as AppConfig
  } catch {
    return null
  }
}

// ============ 配置存储 ============
export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CONFIG)
    if (!raw) return { ...DEFAULT_CONFIG }
    const config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
    // 旧版本数据迁移：旧演示模式切换的会员没有 memberExpiresAt，设为永久有效
    if (config.memberLevel !== 'free' && config.memberExpiresAt < 0) {
      config.memberExpiresAt = 0
      localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config))
    }
    return config as AppConfig
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(config))
  // 异步备份到 Preferences（卸载保留）
  backupConfigToPrefs(config)
}

/** 启动时检查是否需要从 Preferences 恢复配置（覆盖安装场景） */
export async function checkAndRestoreConfig(): Promise<void> {
  if (!isNative()) return
  const localRaw = localStorage.getItem(STORAGE_KEYS.CONFIG)
  if (localRaw) return // localStorage 有数据，不需要恢复

  const restored = await restoreConfigFromPrefs()
  if (restored) {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(restored))
    console.log('[VoxLog] 配置已从 Preferences 恢复')
  }
}

// ============ 日记存储 ============
function diaryKey(date: string): string {
  return `${STORAGE_KEYS.DIARY_PREFIX}${date}`
}

export function saveDiary(entry: DiaryEntry): void {
  localStorage.setItem(diaryKey(entry.date), JSON.stringify(entry))
  // 更新索引
  const index = getDiaryIndex()
  if (!index.includes(entry.date)) {
    index.push(entry.date)
    index.sort((a, b) => b.localeCompare(a))
    localStorage.setItem(STORAGE_KEYS.DIARY_INDEX, JSON.stringify(index))
  }
}

export function loadDiary(date: string): DiaryEntry | null {
  try {
    const raw = localStorage.getItem(diaryKey(date))
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function deleteDiary(date: string): void {
  localStorage.removeItem(diaryKey(date))
  const index = getDiaryIndex().filter(d => d !== date)
  localStorage.setItem(STORAGE_KEYS.DIARY_INDEX, JSON.stringify(index))
}

export function getDiaryIndex(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DIARY_INDEX)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function getAllDiaries(): DiaryEntry[] {
  const index = getDiaryIndex()
  const result: DiaryEntry[] = []
  for (const date of index) {
    const entry = loadDiary(date)
    if (entry) result.push(entry)
  }
  return result
}

export function getDiariesByDateRange(startDate: string, endDate: string): DiaryEntry[] {
  return getAllDiaries().filter(d => d.date >= startDate && d.date <= endDate)
}

// ============ 搜索 ============
export function searchDiaries(keyword: string): SearchResult[] {
  if (!keyword.trim()) return []
  const kw = keyword.toLowerCase()
  const all = getAllDiaries()
  const results: SearchResult[] = []

  for (const entry of all) {
    const content = entry.content.toLowerCase()
    if (content.includes(kw)) {
      const idx = content.indexOf(kw)
      const start = Math.max(0, idx - 30)
      const end = Math.min(entry.content.length, idx + keyword.length + 60)
      const excerpt = (start > 0 ? '...' : '') + entry.content.slice(start, end) + (end < entry.content.length ? '...' : '')
      const matchCount = (content.match(new RegExp(kw, 'g')) || []).length
      results.push({ date: entry.date, excerpt, matchCount })
    }
  }

  return results.sort((a, b) => b.date.localeCompare(a.date))
}

// ============ 日期工具 ============
export function getTodayDate(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function getWeekRange(): { start: string; end: string } {
  const today = new Date()
  const day = today.getDay()
  const diff = today.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(today.setDate(diff))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    start: format(monday, 'yyyy-MM-dd'),
    end: format(sunday, 'yyyy-MM-dd'),
  }
}

export function getMonthRange(): { start: string; end: string } {
  const today = new Date()
  const start = format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd')
  const end = format(new Date(today.getFullYear(), today.getMonth() + 1, 0), 'yyyy-MM-dd')
  return { start, end }
}

export function getYearRange(): { start: string; end: string } {
  const year = new Date().getFullYear()
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
  }
}

// ============ 总结记录存储 ============
function loadSummaryList(): SummaryRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SUMMARY_LIST)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function saveSummaryRecord(record: SummaryRecord): void {
  const list = loadSummaryList()
  // 同一 period + 同一 dateRange.start 覆盖旧记录
  const idx = list.findIndex(r => r.period === record.period && r.dateRange.start === record.dateRange.start)
  if (idx >= 0) {
    list[idx] = record
  } else {
    list.unshift(record)
  }
  // 每种 period 最多保留 20 条
  const kept: SummaryRecord[] = []
  const counts: Record<string, number> = {}
  for (const r of list) {
    counts[r.period] = (counts[r.period] || 0) + 1
    if (counts[r.period] <= 20) kept.push(r)
  }
  localStorage.setItem(STORAGE_KEYS.SUMMARY_LIST, JSON.stringify(kept))
}

export function getSummaryRecords(period: SummaryPeriod): SummaryRecord[] {
  return loadSummaryList()
    .filter(r => r.period === period)
    .sort((a, b) => b.generatedAt - a.generatedAt)
}

export function deleteSummaryRecord(id: string): void {
  const list = loadSummaryList().filter(r => r.id !== id)
  localStorage.setItem(STORAGE_KEYS.SUMMARY_LIST, JSON.stringify(list))
}

// ============ 缓存清理 ============
// 匿名设备 ID 的独立 localStorage key（与 voxlog_config 分离，换机恢复时需要保留）
export const DEVICE_ID_KEY = 'voxlog_device_id'

export function clearCache(): void {
  const keysToKeep: string[] = [
    STORAGE_KEYS.CONFIG,
    STORAGE_KEYS.DIARY_INDEX,
    STORAGE_KEYS.SUMMARY_LIST,
    DEVICE_ID_KEY,
  ]
  const index = getDiaryIndex()
  index.forEach(date => keysToKeep.push(diaryKey(date)))

  const allKeys = Object.keys(localStorage)
  allKeys.forEach(key => {
    if (!keysToKeep.includes(key)) {
      localStorage.removeItem(key)
    }
  })
}

// ============ 初始化演示数据 ============
export function initDemoData(): void {
  const index = getDiaryIndex()
  if (index.length > 0) return // 已有数据不初始化

  const today = getTodayDate()
  const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd')
  const twoDaysAgo = format(new Date(Date.now() - 86400000 * 2), 'yyyy-MM-dd')
  const threeDaysAgo = format(new Date(Date.now() - 86400000 * 3), 'yyyy-MM-dd')

  const demoEntries: DiaryEntry[] = [
    {
      date: today,
      content: `【日期】${today}\n【天气】\n【今日记录】\n今天是个普通的周三，上午开了产品评审会，下午专注写了两个功能模块的代码。傍晚去楼下散步，遇到邻居聊了会儿，心情不错。\n【每日新知】\n了解到 CSS container queries 的用法，比媒体查询更灵活，非常适合组件级响应式设计。\n【今日备忘】\n明天记得准备周报，下周一需要提交季度总结。`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      date: yesterday,
      content: `【日期】${yesterday}\n【天气】\n【今日记录】\n昨天读完了《深度工作》的最后一章，整本书给我最大的启发是：专注力是一种可以训练的技能，而非天赋。晚上把书中的几个方法整理成了笔记。\n【每日新知】\n深度工作的核心：每天固定时段不受打扰地专注工作，哪怕只有 1-2 小时，长期坚持效果惊人。\n【今日备忘】\n书里推荐的「关机仪式」值得尝试：每天下班前把未完成的任务写下来，然后说"已关机"，帮助大脑真正放松。`,
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 86400000,
    },
    {
      date: twoDaysAgo,
      content: `【日期】${twoDaysAgo}\n【天气】\n【今日记录】\n周末睡了个懒觉，下午去咖啡馆坐了三个小时，顺带把积压的几封邮件回复完了。晚上和朋友视频聊了很久，聊到了各自对未来的规划，很有收获。\n【每日新知】\n朋友分享了一个有趣的观点：「慢下来」本身就是一种生产力，因为它帮你看清什么真正重要。\n【今日备忘】\n答应朋友帮他看一下简历，本周内要发给他。`,
      createdAt: Date.now() - 86400000 * 2,
      updatedAt: Date.now() - 86400000 * 2,
    },
    {
      date: threeDaysAgo,
      content: `【日期】${threeDaysAgo}\n【天气】\n【今日记录】\n今天早起跑步，5公里，状态很好。上午参加了一个线上分享会，主题是 AI 在设计领域的应用，讲师分享了很多实际案例，让我对 AI 辅助设计有了新的认识。\n【每日新知】\nAI 不是替代设计师，而是把设计师从重复性工作中解放出来，专注于更有创造价值的决策层面。\n【今日备忘】\n跑步目标：本月累计 50 公里，目前已完成 28 公里，加油！`,
      createdAt: Date.now() - 86400000 * 3,
      updatedAt: Date.now() - 86400000 * 3,
    },
  ]

  demoEntries.forEach(entry => saveDiary(entry))
}
