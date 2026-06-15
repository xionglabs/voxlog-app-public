import type { DiaryEntry, ExportFormat, MemberLevel } from '@/types/voxlog'
import { THEMES } from '@/constants/themes'
import type { ThemeId } from '@/types/voxlog'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'

/** 判断是否在原生平台 */
const isNative = () => Capacitor.isNativePlatform()

/** 获取导出目录名称 */
function getExportDir(): string {
  return 'VoxLog导出'
}

/** 获取导出完整路径描述 */
export function getExportPathDesc(): string {
  if (isNative()) {
    return 'Documents/VoxLog导出/'
  }
  return '浏览器下载文件夹'
}

/** 保存文件到设备（原生用 Filesystem，Web 用 blob 下载），返回保存路径 */
async function saveFile(filename: string, data: string | Blob, mimeType: string): Promise<string> {
  if (isNative()) {
    // Android：保存到外部存储 Documents/VoxLog导出/（卸载时保留）
    const dirName = getExportDir()
    try {
      await Filesystem.mkdir({
        path: dirName,
        directory: Directory.Documents,
        recursive: true,
      })
    } catch {
      // 目录可能已存在，忽略错误
    }

    let base64 = ''
    if (typeof data === 'string') {
      base64 = btoa(unescape(encodeURIComponent(data)))
    } else {
      const arrayBuffer = await data.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      base64 = btoa(binary)
    }

    await Filesystem.writeFile({
      path: `${dirName}/${filename}`,
      data: base64,
      directory: Directory.Documents,
      recursive: true,
    })

    // 返回完整路径描述
    const { uri } = await Filesystem.getUri({
      path: `${dirName}/${filename}`,
      directory: Directory.Documents,
    })
    return uri
  } else {
    // Web：使用 blob URL 下载
    const blob = typeof data === 'string'
      ? new Blob([data], { type: `${mimeType};charset=utf-8` })
      : data
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return filename
  }
}

// ============ 导出 Markdown ============
export async function exportMarkdown(entry: DiaryEntry): Promise<void> {
  await saveFile(`${entry.date}.md`, entry.content, 'text/markdown')
}

// ============ 导出 Word (.docx) ============
export async function exportWord(entry: DiaryEntry): Promise<void> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')

  const lines = entry.content.split('\n')
  const paragraphs = lines.map(line => {
    if (line.startsWith('【') && line.includes('】')) {
      return new Paragraph({
        text: line,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
      })
    }
    return new Paragraph({
      children: [new TextRun({ text: line, size: 24 })],
      spacing: { after: 80 },
    })
  })

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: `VoxLog 日记 - ${entry.date}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 300 },
        }),
        ...paragraphs,
      ],
    }],
  })

  const buffer = await Packer.toBlob(doc)
  await saveFile(`${entry.date}.docx`, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}

// ============ 导出长图 ============
export async function exportImage(
  entry: DiaryEntry,
  themeId: ThemeId,
  memberLevel: MemberLevel,
  language: 'zh' | 'en'
): Promise<void> {
  const theme = THEMES[themeId]
  const withWatermark = memberLevel === 'free'

  // 创建临时容器
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed; left: -9999px; top: 0;
    width: 750px; padding: 60px 60px 80px;
    background: ${theme.bg};
    color: ${theme.text};
    font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', sans-serif;
    line-height: 1.8;
  `

  const titleEl = document.createElement('div')
  titleEl.style.cssText = `font-size: 28px; font-weight: 700; margin-bottom: 8px; color: ${theme.text};`
  titleEl.textContent = language === 'zh' ? 'VoxLog 口述日记' : 'VoxLog'

  const dateEl = document.createElement('div')
  dateEl.style.cssText = `font-size: 16px; color: ${theme.mutedText}; margin-bottom: 40px;`
  dateEl.textContent = entry.date

  const dividerEl = document.createElement('div')
  dividerEl.style.cssText = `height: 1px; background: ${theme.border}; margin-bottom: 40px;`

  const contentEl = document.createElement('div')
  contentEl.style.cssText = `font-size: 16px; white-space: pre-wrap; word-break: break-word;`

  // 处理内容，高亮标签
  const lines = entry.content.split('\n')
  lines.forEach((line, i) => {
    const lineEl = document.createElement('div')
    lineEl.style.cssText = 'margin-bottom: 8px;'
    if (line.startsWith('【') && line.includes('】')) {
      lineEl.style.fontWeight = '600'
      lineEl.style.color = theme.accent
      lineEl.style.marginTop = i > 0 ? '24px' : '0'
    }
    lineEl.textContent = line
    contentEl.appendChild(lineEl)
  })

  const footerEl = document.createElement('div')
  footerEl.style.cssText = `
    margin-top: 48px; padding-top: 24px;
    border-top: 1px solid ${theme.border};
    font-size: 13px; color: ${theme.mutedText};
    display: flex; justify-content: space-between;
  `
  footerEl.innerHTML = `<span>${language === 'zh' ? '由 VoxLog 口述日记生成' : 'Generated by VoxLog'}</span><span>${entry.date}</span>`

  container.appendChild(titleEl)
  container.appendChild(dateEl)
  container.appendChild(dividerEl)
  container.appendChild(contentEl)
  container.appendChild(footerEl)

  // 水印
  if (withWatermark) {
    const wmEl = document.createElement('div')
    wmEl.style.cssText = `
      position: absolute; bottom: 24px; right: 24px;
      font-size: 12px; color: ${theme.mutedText}; opacity: 0.5;
    `
    wmEl.textContent = 'VoxLog Free'
    container.style.position = 'relative'
    container.appendChild(wmEl)
  }

  document.body.appendChild(container)

  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: theme.bg,
    })

    const pngData = canvas.toDataURL('image/png')
    if (isNative()) {
      // 移除 data URL 前缀后保存
      const base64 = pngData.replace(/^data:image\/png;base64,/, '')
      const dirName = getExportDir()
      try {
        await Filesystem.mkdir({ path: dirName, directory: Directory.Documents, recursive: true })
      } catch { /* ignore */ }
      await Filesystem.writeFile({
        path: `${dirName}/${entry.date}.png`,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      })
    } else {
      const link = document.createElement('a')
      link.download = `${entry.date}.png`
      link.href = pngData
      link.click()
    }
  } finally {
    document.body.removeChild(container)
  }
}

// ============ 导出 PDF ============
// jsPDF 内置字体不含中文，乱码根源在此。
// 解法：用 html2canvas 将内容渲染成图片再插入 PDF，与导出图片同理，完全支持中文。
export async function exportPdf(entry: DiaryEntry, themeId?: ThemeId): Promise<void> {
  const theme = THEMES[(themeId ?? 'white') as ThemeId]

  // 1. 创建临时渲染容器（与 exportImage 逻辑相同，但排版适配 A4）
  const container = document.createElement('div')
  container.style.cssText = `
    position: fixed; left: -9999px; top: 0;
    width: 794px; padding: 60px 64px 80px;
    background: #ffffff;
    color: #1a1a1a;
    font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB',
      'Microsoft YaHei', 'WenQuanYi Micro Hei', sans-serif;
    line-height: 1.85;
    box-sizing: border-box;
  `

  // 标题
  const titleEl = document.createElement('div')
  titleEl.style.cssText = `
    font-size: 22px; font-weight: 700; margin-bottom: 6px; color: #1a1a1a;
  `
  titleEl.textContent = 'VoxLog 口述日记'

  // 日期
  const dateEl = document.createElement('div')
  dateEl.style.cssText = `font-size: 14px; color: #888; margin-bottom: 32px;`
  dateEl.textContent = entry.date

  // 分割线
  const dividerEl = document.createElement('div')
  dividerEl.style.cssText = `height: 1px; background: #e0e0e0; margin-bottom: 32px;`

  // 正文（逐行渲染，标签行高亮）
  const contentEl = document.createElement('div')
  contentEl.style.cssText = `font-size: 15px; word-break: break-word;`
  entry.content.split('\n').forEach((line, i) => {
    const lineEl = document.createElement('div')
    lineEl.style.marginBottom = '7px'
    if (line.startsWith('【') && line.includes('】')) {
      lineEl.style.fontWeight = '600'
      lineEl.style.color = theme.accent
      if (i > 0) lineEl.style.marginTop = '20px'
    }
    lineEl.textContent = line || '\u00A0' // 空行用 &nbsp; 撑高度
    contentEl.appendChild(lineEl)
  })

  // 页脚
  const footerEl = document.createElement('div')
  footerEl.style.cssText = `
    margin-top: 48px; padding-top: 20px;
    border-top: 1px solid #e0e0e0;
    font-size: 12px; color: #aaa;
    display: flex; justify-content: space-between;
  `
  footerEl.innerHTML = `<span>由 VoxLog 口述日记生成</span><span>${entry.date}</span>`

  container.appendChild(titleEl)
  container.appendChild(dateEl)
  container.appendChild(dividerEl)
  container.appendChild(contentEl)
  container.appendChild(footerEl)
  document.body.appendChild(container)

  try {
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')

    // 2. 渲染为 canvas（scale=2 保证高清）
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: 794,
    })

    // 3. 按 A4 尺寸分页插入 PDF
    // A4: 210mm × 297mm，jsPDF 内部单位 mm
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const pageW = 210
    const pageH = 297
    const margin = 0 // 图片铺满页面（容器内已有 padding）

    const imgW = pageW - margin * 2
    // canvas 实际像素尺寸（scale=2）
    const canvasPxW = canvas.width   // 794 * 2 = 1588
    const canvasPxH = canvas.height
    // 1mm 对应多少 canvas 像素
    const pxPerMm = canvasPxW / imgW
    // 每页可容纳的 canvas 像素高度
    const pageHeightPx = pageH * pxPerMm

    let offsetY = 0
    let pageIndex = 0

    while (offsetY < canvasPxH) {
      if (pageIndex > 0) pdf.addPage()

      // 截取当前页的 canvas 区域
      const sliceH = Math.min(pageHeightPx, canvasPxH - offsetY)
      const sliceCanvas = document.createElement('canvas')
      sliceCanvas.width = canvasPxW
      sliceCanvas.height = sliceH
      const ctx = sliceCanvas.getContext('2d')!
      ctx.drawImage(canvas, 0, offsetY, canvasPxW, sliceH, 0, 0, canvasPxW, sliceH)

      const imgData = sliceCanvas.toDataURL('image/jpeg', 0.92)
      const sliceHeightMm = sliceH / pxPerMm
      pdf.addImage(imgData, 'JPEG', margin, margin, imgW, sliceHeightMm)

      offsetY += pageHeightPx
      pageIndex++
    }

    const pdfData = pdf.output('datauristring')
    if (isNative()) {
      const base64 = pdfData.replace(/^data:application\/pdf;base64,/, '')
      const dirName = getExportDir()
      try {
        await Filesystem.mkdir({ path: dirName, directory: Directory.Documents, recursive: true })
      } catch { /* ignore */ }
      await Filesystem.writeFile({
        path: `${dirName}/${entry.date}.pdf`,
        data: base64,
        directory: Directory.Documents,
        recursive: true,
      })
    } else {
      pdf.save(`${entry.date}.pdf`)
    }
  } finally {
    document.body.removeChild(container)
  }
}

// ============ 统一导出入口 ============
export async function exportDiary(
  format: ExportFormat,
  entry: DiaryEntry,
  themeId: ThemeId,
  memberLevel: MemberLevel,
  language: 'zh' | 'en'
): Promise<string> {
  switch (format) {
    case 'md': return await exportMarkdown(entry)
    case 'word': return await exportWord(entry)
    case 'image': return await exportImage(entry, themeId, memberLevel, language)
    case 'pdf': return await exportPdf(entry, themeId)
  }
  return ''
}
