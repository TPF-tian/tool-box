#!/usr/bin/env node
// 下载/复制 tesseract.js 运行时资源到 public/tesseract/
// tesseract.js 7 默认从 jsDelivr 拉 worker + WASM + 语言模型
// 国内访问 jsDelivr 不稳的话, 改 LANG_BASE 指向你自己的镜像
//
// 用法: node scripts/download-tesseract-assets.mjs
// 幂等: 已存在的文件跳过
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import https from 'node:https'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const dest = path.join(projectRoot, 'public/tesseract')

fs.mkdirSync(path.join(dest, 'core'), { recursive: true })
fs.mkdirSync(path.join(dest, 'lang-data'), { recursive: true })

function copyIfMissing(src, dst, label) {
  if (fs.existsSync(dst)) {
    console.log(`  [skip] ${label} (已存在)`)
    return
  }
  if (!fs.existsSync(src)) {
    throw new Error(`源文件不存在: ${src}`)
  }
  fs.copyFileSync(src, dst)
  console.log(`  [copy] ${label} (${(fs.statSync(dst).size / 1024).toFixed(0)} KB)`)
}

// 1. 复制 worker.min.js
console.log('1. tesseract worker')
const workerSrc = path.join(projectRoot, 'node_modules/tesseract.js/dist/worker.min.js')
copyIfMissing(workerSrc, path.join(dest, 'worker.min.js'), 'worker.min.js')

// 2. 复制 tesseract.js-core (lstm + simd 版本, 现代浏览器最优)
console.log('2. tesseract core (simd-lstm wasm)')
const pnpmCore = path.join(
  projectRoot,
  'node_modules/.pnpm/tesseract.js-core@7.0.0/node_modules/tesseract.js-core'
)
let coreSrc = pnpmCore
if (!fs.existsSync(coreSrc)) {
  // 兼容 npm / yarn 安装路径
  const fallback = path.join(projectRoot, 'node_modules/tesseract.js-core')
  if (fs.existsSync(fallback)) coreSrc = fallback
  else throw new Error('找不到 tesseract.js-core, 请确认已 pnpm install')
}
for (const f of ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm']) {
  copyIfMissing(path.join(coreSrc, f), path.join(dest, 'core', f), f)
}

// 3. 下载语言模型 (chi_sim + eng)
console.log('3. 语言模型 (chi_sim + eng)')
const LANG_VERSION = '4.0.0_best_int'
const LANG_BASE = `https://cdn.jsdelivr.net/npm/@tesseract.js-data`

function download(url, dst) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dst)
    const req = https.get(url, (res) => {
      // 跟随 3xx 重定向
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        fs.unlink(dst, () => {})
        download(res.headers.location, dst).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        fs.unlink(dst, () => {})
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => file.close(() => resolve()))
    })
    req.on('error', (e) => {
      file.close()
      fs.unlink(dst, () => {})
      reject(e)
    })
  })
}

async function downloadLang(lang) {
  const dst = path.join(dest, 'lang-data', `${lang}.traineddata.gz`)
  if (fs.existsSync(dst) && fs.statSync(dst).size > 1000) {
    console.log(`  [skip] ${lang}.traineddata.gz (已存在)`)
    return
  }
  const url = `${LANG_BASE}/${lang}/${LANG_VERSION}/${lang}.traineddata.gz`
  console.log(`  [get ] ${url}`)
  await download(url, dst)
  console.log(`  [ok  ] ${lang}.traineddata.gz (${(fs.statSync(dst).size / 1024 / 1024).toFixed(2)} MB)`)
}

for (const lang of ['chi_sim', 'eng']) {
  try {
    await downloadLang(lang)
  } catch (e) {
    console.warn(`  [warn] ${lang} 下载失败 (${e.message}), OCR 不会识别该语言`)
  }
}

console.log('\n完成. 资源路径: public/tesseract/')
console.log('vite build 会自动复制到 dist/tesseract/')
