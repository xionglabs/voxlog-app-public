/**
 * 按目录结构导出全部日记 + 总结为 ZIP
 *
 * VoxLog/
 *   diary/
 *     2026-05/
 *       2026-05-23.md          ← 单日日记
 *       2026-05-week-1.md      ← 周复盘（按 dateRange.start 月份归档）
 *       2026-05-month.md       ← 月复盘
 *     2026-06/
 *       ...
 *     2026-year.md             ← 年度复盘（放在 diary/ 根目录）
 */

import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { getAllDiaries, getSummaryRecords } from '@/utils/storage'
import type { SummaryPeriod } from '@/types/voxlog'

// ── 文件头注释 ──────────────────────────────────────────
function diaryHeader(date: string): string {
  return `<!-- VoxLog 日记 | ${date} -->\n\n`
}

function summaryHeader(period: string, start: string, end: string, count: number): string {
  return `<!-- VoxLog 复盘 | ${period} | ${start} ~ ${end} | ${count} 篇 -->\n\n`
}

// ── 导出入口 ──────────────────────────────────────────
export async function exportAllAsZip(): Promise<{ savedPath: string; native: boolean }> {
  const zip = new JSZip()

  // 用路径字符串写文件，避免 folder() 返回值的类型问题
  function addFile(path: string, content: string) {
    zip.file(path, content)
  }

  // ── 1. 所有日记按月分组 ──
  const allDiaries = getAllDiaries()
  const PERIODS: SummaryPeriod[] = ['week', 'month', 'year']
  const allSummaries = PERIODS.flatMap(p => getSummaryRecords(p))

  if (allDiaries.length === 0 && allSummaries.length === 0) {
    throw new Error('暂无可导出的日记数据')
  }

  for (const entry of allDiaries) {
    const month = entry.date.slice(0, 7)   // "2026-05"
    const content = diaryHeader(entry.date) + entry.content
    addFile(`VoxLog/diary/${month}/${entry.date}.md`, content)
  }

  // ── 2. 总结记录按类型归档 ──
  const periodLabel: Record<SummaryPeriod, string> = { week: '周复盘', month: '月复盘', year: '年度复盘' }

  for (const period of PERIODS) {
    const records = getSummaryRecords(period)
    const monthCounters: Record<string, number> = {}

    for (const record of records) {
      const month = record.dateRange.start.slice(0, 7)
      const content = summaryHeader(
        periodLabel[period],
        record.dateRange.start,
        record.dateRange.end,
        record.diaryCount,
      ) + record.content

      if (period === 'year') {
        const year = record.dateRange.start.slice(0, 4)
        addFile(`VoxLog/diary/${year}-year.md`, content)
      } else if (period === 'month') {
        addFile(`VoxLog/diary/${month}/${month}-month.md`, content)
      } else {
        // week：同月多篇加序号
        monthCounters[month] = (monthCounters[month] || 0) + 1
        const seq = monthCounters[month]
        const filename = seq === 1
          ? `${month}-week-summary.md`
          : `${month}-week-summary-${seq}.md`
        addFile(`VoxLog/diary/${month}/${filename}`, content)
      }
    }
  }

  // ── 3. 生成并下载 ZIP ──
  const today = new Date().toISOString().slice(0, 10)
  const filename = `VoxLog-备份-${today}.zip`

  if (Capacitor.isNativePlatform()) {
    // ── Android 原生：通过 Capacitor Filesystem 写入 Documents/VoxLog导出/ ──
    const dirName = 'VoxLog导出'
    try {
      await Filesystem.mkdir({ path: dirName, directory: Directory.Documents, recursive: true })
    } catch {
      // 目录可能已存在
    }

    // generateAsync type 必须用 'base64'，Filesystem.writeFile 会自动将 base64 解码为二进制
    const blob = await zip.generateAsync({ type: 'base64', compression: 'DEFLATE' })
    await Filesystem.writeFile({
      path: `${dirName}/${filename}`,
      data: blob,
      directory: Directory.Documents,
      // ⚠️ 不指定 encoding：base64 数据写入时不能加 Encoding.UTF8，
      // 否则 Capacitor 会把 base64 字符串当 UTF-8 文本写入，ZIP 文件损坏
    })
    const { uri } = await Filesystem.getUri({ path: `${dirName}/${filename}`, directory: Directory.Documents })
    return { savedPath: uri, native: true }
  } else {
    // ── Web / PWA：触发浏览器下载 ──
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    saveAs(blob, filename)
    return { savedPath: filename, native: false }
  }
}
