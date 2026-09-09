#!/bin/bash
# ============================================================================
# ToolBox 一键推送到 GitHub
# 用法: bash scripts/push-to-github.sh
# 作用:
#   1. 把 remote 从 Gitee 切到 GitHub
#   2. 一次性 stage 所有改动 + 新文件
#   3. 创建 commit (如果还没有)
#   4. 推送到 GitHub
# ============================================================================
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
GITHUB_URL="https://github.com/TPF-tian/tool-box.git"
COMMIT_MSG="chore: 开源准备 (LICENSE, 社区文件, 文档, 截图, 配置泛化)"

cd "$REPO_DIR"

echo "==> 1/4 检查当前 remote"
git remote -v

echo ""
echo "==> 2/4 切换 remote 到 GitHub"
if git remote get-url origin 2>/dev/null | grep -q "gitee.com"; then
  git remote set-url origin "$GITHUB_URL"
  echo "  已切换: origin → $GITHUB_URL"
elif git remote get-url origin 2>/dev/null | grep -q "github.com"; then
  echo "  已经是 GitHub，跳过"
else
  git remote add origin "$GITHUB_URL"
  echo "  已添加: origin → $GITHUB_URL"
fi

echo ""
echo "==> 3/4 准备 commit"
git add -A
if git diff --cached --quiet; then
  echo "  没有 staged 改动"
else
  if git diff --cached --quiet HEAD; then
    echo "  已有 commit, 跳过"
  else
    git commit -m "$COMMIT_MSG"
    echo "  ✅ commit 已创建"
  fi
fi

echo ""
echo "==> 4/4 推送到 GitHub"
echo "  即将推送到: $GITHUB_URL"
echo "  分支: $(git branch --show-current)"
echo ""
git push -u origin "$(git branch --show-current)"

echo ""
echo "✅ 完成!"
echo "👉 现在去 https://github.com/TPF-tian/tool-box"
echo "   1. 看到 README 渲染出来了"
echo "   2. 右侧 About 区 ⚙️ → 填 Description / Website / Topics"
echo "   3. 截图区会按 docs/screenshots/ 里的图片自动展示"
