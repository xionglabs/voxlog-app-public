// ============ 日记相关类型 ============
export interface DiaryEntry {
  date: string         // YYYY-MM-DD
  content: string      // Markdown 格式日记内容
  createdAt: number    // 创建时间戳
  updatedAt: number    // 更新时间戳
}

// ============ 会员等级 ============
export type MemberLevel = 'free' | 'standard' | 'pro'

// ============ 主题类型 ============
export type ThemeId = 'white' | 'black' | 'gray' | 'blue' | 'mint' | 'pink' | 'purple'

export interface Theme {
  id: ThemeId
  nameZh: string
  nameEn: string
  bg: string
  text: string
  secondary: string
  accent: string
  border: string
  inputBg: string
  cardBg: string
  mutedText: string
}

// ============ 语言 ============
export type Language = 'zh' | 'en'

// ============ 配置 ============
export interface AppConfig {
  theme: ThemeId
  language: Language
  memberLevel: MemberLevel
  memberExpiresAt: number      // 会员到期时间戳（ms）；0 = 永久；-1 = 未激活
  deviceId: string             // 匿名设备 ID，首次启动生成，永久存储
  reminderEnabled: boolean
  customApiKey: string
  customBaseUrl: string
  customModel: string          // 自定义模型名，如 deepseek-chat、moonshot-v1-8k 等
  dailyAiCount: Record<string, number>  // { 'YYYY-MM-DD': count }
}

// ============ AI 总结类型 ============
export type SummaryPeriod = 'week' | 'month' | 'year'

// ============ 总结历史记录 ============
export interface SummaryRecord {
  id: string                            // 唯一 ID（生成时间戳字符串）
  period: SummaryPeriod
  dateRange: { start: string; end: string }
  diaryCount: number
  content: string                       // 完整 markdown 内容
  keywords: string[]                    // 从 🎯 关键词章节提取
  generatedAt: number                   // 生成时间戳（ms）
}

// ============ 导出格式 ============
export type ExportFormat = 'md' | 'pdf' | 'word' | 'image'

// ============ 搜索结果 ============
export interface SearchResult {
  date: string
  excerpt: string
  matchCount: number
}
