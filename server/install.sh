#!/bin/bash
# ============================================================================
# U2NETp 抠图服务 - 一键安装 (ToolBox 后端, lightweight)
# 用法: sudo bash install.sh
#
# 装好之后:
#   - 监听 127.0.0.1:8000
#   - systemd 服务 (systemctl status rembg)
#   - 内存限 1G, CPU 限 100%
# ============================================================================
set -e

SERVICE_DIR="/opt/rembg-service"
MODEL_DIR="/var/lib/rembg/.model"
LOG_FILE="/var/log/rembg.log"
SERVICE_FILE="/etc/systemd/system/rembg.service"

cd /tmp  # 避免 cwd 不存在的报错

echo "==> 1/7 检查 root"
if [ "$(id -u)" -ne 0 ]; then
  echo "✗ 请用 sudo 跑" >&2
  exit 1
fi

echo "==> 2/7 系统依赖"
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq python3 python3-venv python3-pip >/dev/null
else
  echo "✗ 仅支持 apt 系 (Debian/Ubuntu)" >&2
  exit 1
fi

echo "==> 3/7 venv"
mkdir -p "$SERVICE_DIR"
if [ ! -d "$SERVICE_DIR/venv" ]; then
  python3 -m venv "$SERVICE_DIR/venv"
fi

echo "==> 4/7 装 onnxruntime + Pillow + pillow-heif"
"$SERVICE_DIR/venv/bin/pip" install --quiet --upgrade pip
"$SERVICE_DIR/venv/bin/pip" install --quiet onnxruntime pillow pillow-heif

echo "==> 5/7 部署服务脚本 + 模型"
cp "$(dirname "$0")/rembg-server.py" "$SERVICE_DIR/rembg-server.py"
chmod +x "$SERVICE_DIR/rembg-server.py"

# 优先用本地的 u2netp.onnx (跟着 install.sh 一起传过来的, 4.4MB 一次到位)
# 如果没有, 服务会自己下 (走 ghproxy 兜底)
mkdir -p "$MODEL_DIR"
if [ -f "$(dirname "$0")/u2netp.onnx" ]; then
  echo "    用本地 u2netp.onnx"
  cp "$(dirname "$0")/u2netp.onnx" "$MODEL_DIR/u2netp.onnx"
else
  echo "    本地没模型, 启动时会自动下载"
fi
chown -R www-data:www-data /var/lib/rembg
touch "$LOG_FILE"
chown www-data:www-data "$LOG_FILE"

echo "==> 6/7 写 systemd 服务 (带资源限制)"
cat > "$SERVICE_FILE" << 'UNIT'
[Unit]
Description=U2NETp background removal service (ToolBox)
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/rembg-service
ExecStart=/opt/rembg-service/venv/bin/python /opt/rembg-service/rembg-server.py 8000
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1
StandardOutput=append:/var/log/rembg.log
StandardError=append:/var/log/rembg.log

# 资源保护: 内存上限 1G (u2netp 只用 ~300MB, 留 700MB 余量)
MemoryMax=1G
# CPU 限制 100% = 一个核, 多了会卡别的服务
CPUQuota=100%

[Install]
WantedBy=multi-user.target
UNIT

echo "==> 7/7 启动 + 验证"
systemctl daemon-reload
systemctl enable rembg
systemctl restart rembg

echo "    等待服务就绪..."
for i in {1..30}; do
  if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/health 2>/dev/null | grep -q 200; then
    echo ""
    echo "✅ 服务跑起来了 (等了 ${i} 秒)"
    echo ""
    echo "下一步:"
    echo "  1. nginx 加 /api/remove-bg 反代 (参考 deploy/nginx-rembg.conf)"
    echo "  2. nginx -t && nginx -s reload"
    echo "  3. 部署前端 dist/ 到任意静态目录 (rsync 到 /var/www/tool-box/ 等)"
    echo "  4. 看日志: tail -f /var/log/rembg.log"
    exit 0
  fi
  sleep 1
done

echo ""
echo "✗ 30 秒还没起来, 看日志: tail -30 $LOG_FILE" >&2
exit 1
