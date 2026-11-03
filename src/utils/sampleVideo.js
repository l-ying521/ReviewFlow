// 生成一个 5 秒的本地测试视频（WebM），保存到 public/，避免依赖外网
// 用法：在浏览器控制台执行 genSampleVideo() 或 node 环境不支持（依赖 DOM）
// 这里直接导出为可复用的工具：优先尝试 mp4，回退 webm

export async function generateSampleVideoBlob(duration = 5000, fps = 30) {
  const width = 640
  const height = 360
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const stream = canvas.captureStream(fps)
  const mimeCandidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  const mimeType =
    mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || 'video/webm'

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
  })
  const chunks = []
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)

  const done = new Promise((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
  })

  recorder.start()

  // 画一段会动的内容：背景渐变 + 移动圆 + 时间码
  const start = performance.now()
  await new Promise((resolve) => {
    function frame(now) {
      const t = (now - start) / 1000
      // 背景
      const g = ctx.createLinearGradient(0, 0, width, height)
      g.addColorStop(0, '#1e293b')
      g.addColorStop(1, '#4c1d95')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, width, height)
      // 移动圆
      const cx = width / 2 + Math.cos(t * 2) * 120
      const cy = height / 2 + Math.sin(t * 2) * 60
      ctx.fillStyle = 'rgba(167,139,250,0.7)'
      ctx.beginPath()
      ctx.arc(cx, cy, 40, 0, Math.PI * 2)
      ctx.fill()
      // 时间码
      ctx.fillStyle = '#e5e7eb'
      ctx.font = 'bold 36px monospace'
      ctx.fillText(`00:0${Math.floor(t)}`.slice(-5), 30, 60)
      ctx.font = '16px monospace'
      ctx.fillText('ReviewFlow Sample Video', 30, height - 30)

      if (now - start < duration) requestAnimationFrame(frame)
      else resolve()
    }
    requestAnimationFrame(frame)
  })

  recorder.stop()
  return done
}

export async function createSampleVideoUrl() {
  const blob = await generateSampleVideoBlob()
  return URL.createObjectURL(blob)
}
