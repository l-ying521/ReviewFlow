import html2pdf from 'html2pdf.js'

function escapeHtml(text = '') {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const pad2 = (n) => String(n).padStart(2, '0')

/** 生成唯一交付凭证号：RF-YYYYMMDD-XXXX（XXXX 为 4 位随机数） */
function generateVoucherNo() {
  const d = new Date()
  const date = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`
  const rand = String(Math.floor(1000 + Math.random() * 9000))
  return `RF-${date}-${rand}`
}

/**
 * 把 AI 输出的简易 Markdown 转成规范的 HTML 列表结构
 * 支持：# / ## / ### 标题、- / * 无序列表、> 引用、**加粗**、普通段落
 * 说明：布局类用 Tailwind；颜色全部内联十六进制——
 * html2canvas 无法解析 Tailwind 编译出的 rgb(0 0 0 / x) 现代颜色语法，
 * 内联颜色可保证 PDF 渲染不丢色。
 */
function markdownToHtml(markdown = '') {
  const inline = (s) =>
    escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

  const html = []
  let inList = false
  const closeList = () => {
    if (inList) {
      html.push('</ul>')
      inList = false
    }
  }

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd()
    let m
    if ((m = line.match(/^###\s+(.+)/))) {
      closeList()
      html.push(
        `<h4 class="mb-1 mt-2 text-[11px] font-semibold" style="color:#6d28d9;">${inline(m[1])}</h4>`,
      )
    } else if ((m = line.match(/^##\s+(.+)/))) {
      closeList()
      html.push(
        `<h3 class="mb-1.5 mt-3 text-[13px] font-bold" style="color:#18181b;">${inline(m[1])}</h3>`,
      )
    } else if ((m = line.match(/^#\s+(.+)/))) {
      closeList()
      html.push(
        `<h2 class="mb-2 mt-3 text-sm font-bold" style="color:#18181b;">${inline(m[1])}</h2>`,
      )
    } else if ((m = line.match(/^\s*[-*]\s+(.+)/))) {
      if (!inList) {
        html.push('<ul class="mb-2 pl-4" style="list-style:disc;">')
        inList = true
      }
      html.push(
        `<li class="mb-1 text-[11px] leading-relaxed" style="color:#3f3f46;">${inline(m[1])}</li>`,
      )
    } else if ((m = line.match(/^&gt;\s?(.+)/)) || (m = line.match(/^>\s?(.+)/))) {
      closeList()
      html.push(
        `<p class="mb-1.5 text-[11px] italic" style="color:#71717a;">${inline(m[1])}</p>`,
      )
    } else if (line.trim() === '') {
      closeList()
    } else {
      closeList()
      html.push(
        `<p class="mb-1.5 text-[11px] leading-relaxed" style="color:#3f3f46;">${inline(line)}</p>`,
      )
    }
  }
  closeList()
  return html.join('')
}

function formatTimestamp(sec) {
  if (sec == null || Number.isNaN(sec)) return null
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${pad2(m)}:${pad2(s)}`
}

/** 批注明细行：序号 + 意见内容（CV 识别带绿色标记，视频批注带时间戳） */
function buildAnnotationRows(annotations) {
  if (!annotations.length) {
    return '<p class="text-[11px]" style="color:#a1a1aa;">本次评审没有批注记录。</p>'
  }
  return annotations
    .map((item, index) => {
      const isCv = item.type === 'cv'
      const badgeColor = isCv ? '#16a34a' : '#dc2626'
      const ts = formatTimestamp(item.timestamp)
      return `
      <div class="mb-1.5 flex rounded-md border px-3 py-2" style="border-color:#e4e4e7;border-left:3px solid ${badgeColor};background-color:#fafafa;page-break-inside:avoid;">
        <span class="mr-2.5 mt-0.5 inline-block h-4 w-4 shrink-0 rounded text-center text-[9px] font-bold leading-4" style="background-color:${badgeColor};color:#ffffff;">${index + 1}</span>
        <div class="min-w-0 flex-1">
          <p class="text-[11px] leading-relaxed" style="color:#3f3f46;">${escapeHtml(item.text)}</p>
          ${ts && ts !== '00:00' ? `<p class="mt-0.5 font-mono text-[9px]" style="color:#a1a1aa;">视频时间 ${ts}</p>` : ''}
        </div>
      </div>`
    })
    .join('')
}

/**
 * 评审证据大图流（视频模式）：
 * 每条带快照的批注渲染为一个全宽卡片——
 * 顶部：⏱ 时间戳 + 批注文字；底部：100% 宽合成大图（含红框）
 */
function buildEvidenceCards(annotations) {
  return annotations
    .map((item, index) => {
      if (!item.snapshot) return ''
      const ts = formatTimestamp(item.timestamp)
      return `
      <div class="mb-4 rounded-lg border p-3" style="border-color:#e4e4e7;page-break-inside:avoid;">
        <div class="mb-2 flex items-center">
          ${ts ? `<span class="mr-2 inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold" style="background-color:#ede9fe;color:#6d28d9;">⏱ ${ts}</span>` : ''}
          <p class="text-xs font-semibold leading-snug" style="color:#27272a;">${index + 1}. ${escapeHtml(item.text)}</p>
        </div>
        <img src="${item.snapshot}" style="width:100%;height:auto;object-fit:contain;aspect-ratio:auto;display:block;background-color:#09090b;border-radius:6px;" />
      </div>`
    })
    .join('')
}

function buildHtml({ snapshot, imageName, mediaType, annotations, aiResult, voucherNo, dateText }) {
  const baseName = (imageName || '未命名作品').replace(/\.[^.]+$/, '')

  const aiBlock = aiResult
    ? markdownToHtml(aiResult)
    : '<p class="text-[11px]" style="color:#a1a1aa;">本次交付未生成 AI 意见归纳。</p>'

  // 视频模式：证据大图流（带快照的批注）+ 无快照批注（如 CV 识别）紧凑行
  // 图片模式：合成大图一张 + 全部批注紧凑行
  const isVideoMode = mediaType === 'video'
  const withSnapshot = annotations.filter((a) => a.snapshot)
  const withoutSnapshot = annotations.filter((a) => !a.snapshot)

  const contentBlock = isVideoMode
    ? `
    <div class="mt-6">
      <h2 class="mb-2 text-xs font-bold" style="color:#52525b;">评审证据（${withSnapshot.length}）</h2>
      ${withSnapshot.length ? buildEvidenceCards(annotations) : '<p class="text-[11px]" style="color:#a1a1aa;">暂无带快照的批注。</p>'}
      ${
        withoutSnapshot.length
          ? `<h3 class="mb-2 mt-4 text-[11px] font-bold" style="color:#52525b;">其他批注（${withoutSnapshot.length}）</h3>${buildAnnotationRows(withoutSnapshot)}`
          : ''
      }
    </div>`
    : `
    <div class="mt-6" style="page-break-inside:avoid;">
      <h2 class="mb-2 text-xs font-bold" style="color:#52525b;">评审画面</h2>
      ${
        snapshot
          ? `<div class="rounded-lg border p-2" style="border-color:#e4e4e7;">
               <img src="${snapshot}" style="width:100%;height:auto;object-fit:contain;aspect-ratio:auto;display:block;background-color:#09090b;border-radius:6px;" />
             </div>`
          : '<p class="text-[11px]" style="color:#a1a1aa;">暂无可导出的画面。</p>'
      }
    </div>
    <div class="mt-6">
      <h2 class="mb-2 text-xs font-bold" style="color:#52525b;">批注清单（${annotations.length}）</h2>
      ${buildAnnotationRows(annotations)}
    </div>`

  // 颜色一律内联（见 markdownToHtml 注释）；布局/间距/字号用 Tailwind
  return `
  <div class="w-full bg-white px-10 py-9 font-sans" style="color:#27272a;">

    <!-- Header：Logo + 凭证信息 -->
    <div class="flex items-end justify-between border-b-2 pb-4" style="border-color:#7c3aed;">
      <div>
        <div class="text-xl font-extrabold tracking-tight" style="color:#18181b;">
          Review<span style="color:#7c3aed;">Flow</span>
        </div>
        <p class="mt-1 text-[10px]" style="color:#71717a;">AI 评审交付舱 · 交付确认单</p>
      </div>
      <div class="text-right">
        <p class="text-[11px] font-bold tracking-wide" style="color:#18181b;">交付凭证号：<span class="font-mono" style="color:#7c3aed;">${voucherNo}</span></p>
        <p class="mt-1 text-[10px]" style="color:#71717a;">导出日期：${dateText}</p>
      </div>
    </div>

    <!-- Project Info -->
    <div class="mt-5 flex rounded-lg border px-5 py-3" style="border-color:#e4e4e7;background-color:#fafafa;">
      <div class="flex-1">
        <p class="text-[9px] uppercase tracking-wider" style="color:#a1a1aa;">项目名称</p>
        <p class="mt-0.5 text-xs font-semibold" style="color:#27272a;">${escapeHtml(baseName)}</p>
      </div>
      <div class="w-px self-stretch" style="background-color:#e4e4e7;"></div>
      <div class="flex-1 pl-5">
        <p class="text-[9px] uppercase tracking-wider" style="color:#a1a1aa;">包含批注数量</p>
        <p class="mt-0.5 text-xs font-semibold" style="color:#27272a;">${annotations.length} 条</p>
      </div>
    </div>

    <!-- Content：视频=证据大图流 / 图片=合成大图+批注清单 -->
    ${contentBlock}

    <!-- AI 意见归纳（置于所有证据大图之后） -->
    <div class="mt-6">
      <h2 class="mb-2 text-xs font-bold" style="color:#52525b;">AI 意见归纳</h2>
      <div class="rounded-lg border px-5 py-4" style="border-color:#e4e4e7;background-color:#fafafa;">
        ${aiBlock}
      </div>
    </div>

    <!-- Footer：双签名区 -->
    <div class="mt-10 flex" style="page-break-inside:avoid;">
      <div class="flex-1 pr-8">
        <p class="text-[10px] font-semibold" style="color:#52525b;">创作者（我）</p>
        <div class="mt-10 border-b" style="border-color:#a1a1aa;"></div>
        <p class="mt-1 text-[9px]" style="color:#a1a1aa;">签名 / 日期</p>
      </div>
      <div class="flex-1 pl-8">
        <p class="text-[10px] font-semibold" style="color:#52525b;">客户确认（签名 / 日期）</p>
        <div class="mt-10 border-b" style="border-color:#a1a1aa;"></div>
        <p class="mt-1 text-[9px]" style="color:#a1a1aa;">签名 / 日期</p>
      </div>
    </div>

    <p class="mt-8 text-center text-[9px]" style="color:#d4d4d8;">本确认单由 ReviewFlow 自动生成 · ${voucherNo}</p>
  </div>`
}

/**
 * 导出交付确认单 PDF
 * 结构：Header（Logo+凭证号）→ 项目信息 → 评审证据大图流 → AI 意见归纳 → 双签名区
 * @returns {Promise<string>} 本次交付凭证号
 */
export async function exportReviewPdf({ snapshot, imageName, mediaType, annotations, aiResult }) {
  const voucherNo = generateVoucherNo()
  const dateText = new Date().toLocaleString('zh-CN', { hour12: false })

  // 外层 host 只负责在页面中隐藏定位，内层 report 才是传给 html2pdf 的内容。
  // position/z-index 等隐藏样式绝不能加在 report 上，否则克隆样式会破坏
  // html2pdf 内部布局，导致空白 PDF。
  const host = document.createElement('div')
  host.style.position = 'absolute'
  host.style.left = '-9999px'
  host.style.top = '0'
  // A4 210mm - 左右各 10mm margin = 190mm ≈ 718px @96dpi
  host.style.width = '718px'
  host.style.zIndex = '-1'

  const report = document.createElement('div')
  report.style.background = '#ffffff'
  report.innerHTML = buildHtml({
    snapshot,
    imageName,
    mediaType,
    annotations,
    aiResult,
    voucherNo,
    dateText,
  })

  host.appendChild(report)
  document.body.appendChild(host)

  try {
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: `ReviewFlow-交付确认单-${voucherNo}.pdf`,
        image: { type: 'jpeg', quality: 0.96 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
          // 固定渲染视口基准，防止重排导致图片尺寸计算偏差
          windowWidth: document.body.scrollWidth,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'] },
      })
      .from(report)
      .save()
  } finally {
    document.body.removeChild(host)
  }

  return voucherNo
}
