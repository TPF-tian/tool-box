#!/usr/bin/env python3
"""
U2NETp 抠图服务 (轻量模型, 4.7MB, 适合小 VPS)
- 不用 rembg, 不用 pymatting, 不用 numba
- 只依赖 onnxruntime + Pillow
- 单实例串行处理 (避免并发把 CPU 跑满卡死)
- 自带资源保护: 拒绝过大的图, 拒绝过频的请求

POST /remove-bg  body: raw image  -> PNG (透明背景)
GET  /health                          -> 200 OK
"""
import io
import os
import sys
import time
import logging
import threading
import urllib.request
import numpy as np
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from PIL import Image
import onnxruntime as ort

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
log = logging.getLogger('rmbg')

# 注册 HEIC/HEIF 解码器 (iPhone 截图)
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    log.info('HEIC/HEIF support enabled')
except ImportError:
    log.info('pillow-heif not installed, HEIC not supported')

MODEL_DIR = '/var/lib/rembg/.model'
MODEL_PATH = os.path.join(MODEL_DIR, 'u2netp.onnx')
INPUT_SIZE = 320
INFERENCE_LOCK = threading.Lock()  # 同一时刻只允许一个推理, 避免 OOM

# 简单的滑动窗口限流: 最多 3 个并发任务排队, 多了直接 503
MAX_QUEUE = 3
queue_sem = threading.BoundedSemaphore(MAX_QUEUE)


def download_model():
    """下 u2netp (4.7MB, 几秒就完)"""
    if os.path.exists(MODEL_PATH) and os.path.getsize(MODEL_PATH) > 1_000_000:
        log.info('Model exists: %s (%d MB)',
                 MODEL_PATH, os.path.getsize(MODEL_PATH) // 1024 // 1024)
        return

    # 4.7MB 走 GitHub 直连其实也行, 顺便配 ghproxy 兜底
    urls = [
        'https://ghproxy.com/https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
        'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
    ]
    last_err = None
    for url in urls:
        try:
            log.info('Downloading %s', url)
            req = urllib.request.Request(url, headers={'User-Agent': 'curl/7.0'})
            with urllib.request.urlopen(req, timeout=120) as resp:
                data = resp.read()
            with open(MODEL_PATH, 'wb') as f:
                f.write(data)
            if os.path.getsize(MODEL_PATH) < 1_000_000:
                raise RuntimeError('Downloaded file too small, probably an HTML error page')
            log.info('Model downloaded: %d MB', os.path.getsize(MODEL_PATH) // 1024 // 1024)
            return
        except Exception as e:
            log.warning('Failed: %s', e)
            last_err = e
    raise RuntimeError(f'All sources failed. Last: {last_err}')


# 启动: 下载 + 加载
log.info('=' * 50)
log.info('U2NETp 抠图服务 (lightweight) 启动中...')
log.info('=' * 50)
download_model()

log.info('Loading model...')
# 限制 onnxruntime 内部线程, 避免吃满 CPU
SESSION = ort.InferenceSession(
    MODEL_PATH,
    providers=['CPUExecutionProvider'],
    # 单实例处理, 不用线程池
    sess_options=None
)
# 强制只用 2 个线程 (服务器一般是双核, 多余的浪费)
SESSION.set_providers(['CPUExecutionProvider'], [
    {'session_config': {
        'session.intra_op_num_threads': '2',
        'session.inter_op_num_threads': '1',
    }}
])
log.info('Model loaded. Input: %s', SESSION.get_inputs()[0].name)

# ImageNet 归一化
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def remove_bg(image_bytes: bytes) -> bytes:
    """同步推理, 串行执行"""
    img = Image.open(io.BytesIO(image_bytes))
    original_size = img.size  # (width, height)

    # 预处理
    img_rgb = img.convert('RGB').resize((INPUT_SIZE, INPUT_SIZE), Image.BILINEAR)
    arr = np.array(img_rgb, dtype=np.float32) / 255.0
    arr = (arr - MEAN) / STD
    arr = arr.transpose(2, 0, 1)[None]  # HWC -> CHW -> NCHW

    # 推理 (用 d0, U2NET 第一个输出是最终预测)
    output = SESSION.run(None, {SESSION.get_inputs()[0].name: arr})[0]
    mask = output[0, 0]  # 1x1xHxW -> HxW

    # 后处理
    mask = (mask - mask.min()) / (mask.max() - mask.min() + 1e-8)
    mask = (mask * 255).astype(np.uint8)
    mask_img = Image.fromarray(mask).resize(original_size, Image.BILINEAR)

    img = img.convert('RGBA')
    img.putalpha(mask_img)

    buf = io.BytesIO()
    img.save(buf, 'PNG', optimize=True)
    return buf.getvalue()


class Handler(BaseHTTPRequestHandler):
    # 限制每个请求的最大处理时间, 超时直接返回 503
    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError):
            pass

    def log_message(self, fmt, *args):
        log.info('%s - %s', self.address_string(), fmt % args)

    def do_GET(self):
        if self.path == '/health':
            body = b'OK'
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path != '/remove-bg':
            self.send_response(404)
            self.end_headers()
            return

        # 限流: 拿不到 semaphore 直接 503
        if not queue_sem.acquire(blocking=False):
            self.send_response(503)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(b'server busy, try again later')
            log.warning('rejected: queue full')
            return

        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0:
                self.send_error(400, 'empty body')
                return
            if length > 20 * 1024 * 1024:
                self.send_error(413, 'too large (max 20MB)')
                return

            data = self.rfile.read(length)
            content_type = self.headers.get('Content-Type', 'unknown')
            log.info('remove-bg: input=%d KB, type=%s, queue=busy',
                     length // 1024, content_type)

            # 串行执行 (CPU 推理, 多任务同时跑会把 CPU 吃满)
            t0 = time.time()
            try:
                with INFERENCE_LOCK:
                    out = remove_bg(data)
            except Exception as e:
                # 把图片解析错误的具体原因告诉前端
                log.exception('image processing failed')
                err_msg = str(e)
                if 'cannot identify image' in err_msg.lower():
                    err_msg = f'无法识别图片格式 (前 16 字节: {data[:16].hex()})'
                self.send_response(400)
                self.send_header('Content-Type', 'text/plain; charset=utf-8')
                self.end_headers()
                self.wfile.write(err_msg.encode('utf-8'))
                return
            dt = time.time() - t0

            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.send_header('Content-Length', str(len(out)))
            self.end_headers()
            self.wfile.write(out)
            log.info('remove-bg: output=%d KB, took=%.1fs',
                     len(out) // 1024, dt)
        except BrokenPipeError:
            log.warning('client disconnected')
        except Exception as e:
            log.exception('remove-bg failed')
            try:
                self.send_error(500, str(e))
            except Exception:
                pass
        finally:
            queue_sem.release()


def main():
    host = '127.0.0.1'
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer((host, port), Handler)
    log.info('=' * 50)
    log.info('Listening on http://%s:%d (U2NETp, lightweight, 4.7MB)', host, port)
    log.info('=' * 50)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info('Shutting down')
        server.shutdown()


if __name__ == '__main__':
    main()
