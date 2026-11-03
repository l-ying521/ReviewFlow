/**
 * AI 评审交付舱 — 外部接口层
 *
 * - requestCvDetection：本地 Mock CV 识别（保持不变）
 * - requestAiSummary：智谱 GLM-4-Flash 真实 API
 *
 * 接入真实 API 的配置说明：
 *   1. 在项目根目录的 .env.local 中填入密钥（该文件已被 .gitignore 忽略，不会提交到 Git）
 *        VITE_ZHIPU_API_KEY=你的智谱 API Key
 *        VITE_BAIDU_TOKEN=你的百度 Access Token
 *   2. 可参考根目录的 .env.example 模板
 *   3. 未配置或仍为占位符时，自动 fallback 到 Mock 演示数据
 *   4. 模型名称：glm-4-flash（免费高速，足够做评审归纳）
 */

/* ============================================================
 * 密钥统一从 Vite 环境变量读取（.env.local）
 * 严禁在此硬编码真实密钥，避免随源码泄露
 * ============================================================ */
const API_KEY = (import.meta.env.VITE_ZHIPU_API_KEY || '').trim()
const BAIDU_ACCESS_TOKEN = (import.meta.env.VITE_BAIDU_TOKEN || '').trim()

// 空值或仍是 .env.example 里的占位符 → 视为未配置，走 Mock 演示模式
const isPlaceholder = (v) => !v || v.startsWith('your_')
const HAS_ZHIPU_KEY = !isPlaceholder(API_KEY)
const HAS_BAIDU_TOKEN = !isPlaceholder(BAIDU_ACCESS_TOKEN)
/* ============================================================ */

/*
 * 接口统一走相对路径 /api/*：
 * - 开发环境：由 vite.config.js 的 server.proxy 转发（规避 CORS）
 * - 生产环境：由 netlify.toml 的 redirects 做服务端代理（规避 CORS）
 */
// 注意：不能用带 _basic 后缀的精简版 OCR 接口，它不返回 location 坐标，画布无法定位绿框
const BAIDU_OCR_ENDPOINT = '/api/cv-classify'

const ZHIPU_API_PATH = '/api/ai-chat'

const MODEL_NAME = 'glm-4-flash'

const SYSTEM_PROMPT = `你是一个专业的交付项目经理，请将以下零散的批注，分类归纳为 [🔴 必须修复]、[🟡 体验优化]、[⚪ 需沟通] 三个类别，用 Markdown 格式输出，语言要精炼专业。`

/**
 * 百度 AI 通用物体和场景识别（advanced_general）
 *
 * @param {Object} payload
 * @param {string} payload.base64 - 去掉 data:image/xxx;base64, 前缀的纯 Base64
 * @param {number} payload.width  - 当前画面实际渲染宽度（像素，用于坐标转百分比）
 * @param {number} payload.height - 当前画面实际渲染高度（像素，用于坐标转百分比）
 * @returns {Promise<Array<{x:number,y:number,width:number,height:number,label:string,text:string}>>}
 *          统一返回百分比相对坐标（0 ~ 1），与 Fabric.js 坐标系对齐
 */
export async function requestCvDetection({ base64, width, height } = {}) {
  // ---- 没 Token → Mock fallback ----
  if (!HAS_BAIDU_TOKEN) {
    return cvMockFallback(width, height)
  }
  if (!base64) {
    throw new Error('没有可识别的画面数据')
  }

  // ---- 百度要求：access_token 放 URL query，image 放 body ----
  const url = `${BAIDU_OCR_ENDPOINT}?access_token=${encodeURIComponent(BAIDU_ACCESS_TOKEN)}`
  const body = new URLSearchParams({ image: base64 })

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(20_000),
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('CV 识别请求超时（20s）')
    }
    throw new Error(`CV 识别网络失败：${err.message}`)
  }

  if (!response.ok) {
    let detail = ''
    try { detail = await response.text() } catch {}
    throw new Error(`百度 API 返回错误（${response.status}）：${detail.slice(0, 120)}`)
  }

  let data
  try { data = await response.json() } catch {
    throw new Error('百度 API 返回无法解析')
  }

  // 百度统一错误码
  if (data.error_code) {
    const msg = data.error_msg || '未知错误'
    switch (data.error_code) {
      case 110: case 111: case 112: case 113:
        throw new Error('百度 Access Token 无效或过期')
      case 216201: case 216202: case 216203:
        throw new Error('图片格式或大小不符合百度要求（建议 <4MB）')
      case 18:
        throw new Error('请求过于频繁，请稍后再试')
      default:
        throw new Error(`百度识别错误（${data.error_code}）：${msg}`)
    }
  }

  // OCR general_basic 返回 words_result[]，其他接口可能返回 result[]，统一兼容
  const results = data.words_result || data.result
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('画面中未检测到文字')
  }
  // ---- 排序：从上到下（top），同一行再从左到右（left） ----
  // 先排序再映射，保证序号排列符合阅读顺序
  const sorted = [...results].sort((r1, r2) => {
    const b1 = r1.location ?? r1
    const b2 = r2.location ?? r2
    const top1 = b1.top ?? 0
    const top2 = b2.top ?? 0
    // top 相差 5px 内视为同一行，改为按 left 排序
    if (Math.abs(top1 - top2) > 5) return top1 - top2
    return (b1.left ?? 0) - (b2.left ?? 0)
  })

  // ---- 坐标转换：百度返回绝对像素 → 我们存百分比 ----
  const parsed = sorted
    .map((r) => {
      const box = r.location ?? r
      const hasBox =
        box.left != null && box.top != null && box.width != null && box.height != null
      if (!hasBox) {
        return null
      }

      const label = (r.words || r.name || r.keyword || '').trim()
      // 严格过滤脏数据：
      // 1) 空 / 单字符（噪点、纯符号）
      // 2) 不含中文或英文字母 —— 即纯标点符号（::、+、? 等）
      if (label.length < 2 || !/[\u4e00-\u9fa5a-zA-Z]/.test(label)) {
        return null
      }
      const confidence = r.score ?? r.probability ?? null
      const text = confidence != null
        ? `识别到字幕：${label}（置信度 ${(confidence * 100).toFixed(1)}%）`
        : `识别到字幕：${label}`

      return {
        x: clamp01(box.left / width),
        y: clamp01(box.top / height),
        width: clamp01(box.width / width),
        height: clamp01(box.height / height),
        label,
        text,
      }
    })
    .filter(Boolean)

  if (parsed.length === 0 && results.length > 0) {
    throw new Error('未识别到有效文字（仅检测到标点符号或噪点）')
  }
  return parsed
}

/* ---------------- CV 辅助 ---------------- */

function clamp01(v) {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

/**
 * 没有 Token 时的 Mock fallback（保证功能不会挂）
 */
function cvMockFallback(width, height) {
  return new Promise((resolve) => {
    setTimeout(() => {
      // 用传入的渲染尺寸算出合理的像素坐标，再手动转为百分比确保逻辑正确
      const W = width || 800
      const H = height || 600
      resolve([
        {
          x: 0.06,
          y: 0.1,
          width: 0.34,
          height: 0.28,
          label: '主体',
          text: '【Mock】未配置百度 Token，以下为演示数据',
        },
        {
          x: 0.52,
          y: 0.38,
          width: 0.3,
          height: 0.22,
          label: '文字',
          text: '请在 .env.local 中配置 VITE_BAIDU_TOKEN 启用真实识别',
        },
      ])
    }, 1200)
  })
}

/**
 * 真实智谱 GLM-4-Flash 调用：把批注数组交给大模型归纳
 *
 * @param {Array} annotations - Zustand Store 里的批注数组
 * @returns {Promise<string>} Markdown 格式的归纳报告
 * @throws {Error} 各种错误（鉴权失败 / 网络不通 / API 异常）统一 throw
 */
export async function requestAiSummary(annotations = []) {
  // ---- 没有 API Key 时走 Mock fallback ----
  if (!HAS_ZHIPU_KEY) {
    return mockFallback(annotations)
  }

  // ---- 构造用户消息 ----
  const payload = annotations.map((a, i) => ({
    index: i + 1,
    type: a.type === 'cv' ? 'CV自动识别' : '人工批注',
    position: `x${Math.round(a.x * 100)}% y${Math.round(a.y * 100)}%`,
    size: `${Math.round(a.width * 100)}%×${Math.round(a.height * 100)}%`,
    timestamp:
      a.timestamp != null && a.timestamp > 0
        ? `${formatTs(a.timestamp)}`
        : '—',
    content: a.text,
  }))

  const userMessage = `以下是项目评审中收集到的 ${annotations.length} 条批注，请分类归纳：

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\``

  // ---- 发起请求 ----
  let response
  try {
    response = await fetch(ZHIPU_API_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.5,
      }),
      // 智谱 API 较慢，给 30s 超时
      signal: AbortSignal.timeout(30_000),
    })
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('请求超时（30s），请检查网络后重试')
    }
    throw new Error(`网络请求失败：${err.message}`)
  }

  // ---- HTTP 状态码检查 ----
  if (!response.ok) {
    let detail = ''
    try {
      const data = await response.json()
      detail = data?.error?.message || data?.error_msg || JSON.stringify(data)
    } catch {
      detail = await response.text().catch(() => '')
    }

    switch (response.status) {
      case 401:
        throw new Error('API Key 无效，请检查是否填错')
      case 403:
        throw new Error('API Key 已过期或额度耗尽')
      case 429:
        throw new Error('请求过于频繁，请稍后再试')
      default:
        throw new Error(`智谱 API 返回错误（${response.status}）：${detail}`)
    }
  }

  // ---- 解析响应体 ----
  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('智谱 API 返回的响应无法解析')
  }

  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('智谱 API 返回空结果')
  }

  return content.trim()
}

/* ---------------- 辅助 ---------------- */

function formatTs(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * 没有 API Key 时的 Mock fallback（保证功能不会挂）
 */
function mockFallback(annotations) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const manual = annotations.filter((a) => a.type !== 'cv').length
      const cv = annotations.filter((a) => a.type === 'cv').length

      const lines = annotations.slice(0, 8).map((a, i) => {
        const prefix = a.type === 'cv' ? '【自动识别】' : '【人工批注】'
        const ts =
          a.timestamp != null && a.timestamp > 0 ? ` [${formatTs(a.timestamp)}]` : ''
        return `${i + 1}. ${prefix}${ts} ${a.text}`
      })

      resolve(`## 🤖 AI 评审意见归纳（Mock 模式）

> ⚠️ 当前未配置智谱 API Key，以下为演示数据。请在 \`src/utils/mockApi.js\` 中填入你的 API Key 后使用真实 AI 归纳。

本次共收集 **${annotations.length}** 条批注（人工 ${manual} 条 / CV 识别 ${cv} 条）。

### 📋 批注概览
${lines.join('\n')}

### 💡 建议归纳
- 共 **${annotations.length}** 条问题待处理，建议优先处理红色标记的关键问题
- 视频帧批注建议在时间轴上逐一验证
- 可点击「自动识别」补充更多结构化检测结果
`)
    }, 800)
  })
}
