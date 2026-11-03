import { createSampleVideoUrl } from './sampleVideo'

const MAX_FILE_SIZE = 20 * 1024 * 1024

/**
 * 读取本地图片文件，返回可用于画布的地址与原始尺寸
 */
export function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('没有选择文件'))
      return
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('仅支持图片文件'))
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      reject(new Error('图片不能超过 20MB'))
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () =>
      resolve({
        url,
        name: file.name,
        width: img.naturalWidth,
        height: img.naturalHeight,
      })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片解析失败'))
    }
    img.src = url
  })
}

/**
 * 加载本地视频文件
 */
export function loadVideoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('video/')) {
      reject(new Error('仅支持视频文件'))
      return
    }
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    video.onloadedmetadata = () =>
      resolve({
        type: 'video',
        url,
        name: file.name,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: video.duration,
      })
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('视频解析失败'))
    }
  })
}

/**
 * 加载本地生成的测试视频（离线可用），返回其原始分辨率
 */
export function loadTestVideo() {
  return new Promise(async (resolve, reject) => {
    try {
      const url = await createSampleVideoUrl()
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.src = url
      video.onloadedmetadata = () =>
        resolve({
          type: 'video',
          url,
          name: 'sample-video',
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
        })
      video.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('测试视频生成失败'))
      }
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * 在限定区域内等比缩放（小图不放大，避免像素化）
 */
export function getDisplaySize(width, height, maxWidth = 960, maxHeight = 640) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1)
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
  }
}

/**
 * 把原图绘制到目标画布，并返回原始像素数据（缓存起来用于后续调色）
 */
export function renderOriginal(image, canvas, width, height) {
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(image, 0, 0, width, height)

  return ctx.getImageData(0, 0, width, height)
}

/**
 * 基于原始像素数据计算亮度，并写回画布
 * value 取值 -100 ~ 100，0 表示保持原样
 */
export function applyBrightness(ctx, originalData, value) {
  const output = new ImageData(
    new Uint8ClampedArray(originalData.data),
    originalData.width,
    originalData.height,
  )

  if (value !== 0) {
    const delta = Math.round((value / 100) * 255)
    const data = output.data
    for (let i = 0; i < data.length; i += 4) {
      data[i] += delta
      data[i + 1] += delta
      data[i + 2] += delta
    }
  }

  ctx.putImageData(output, 0, 0)
}
