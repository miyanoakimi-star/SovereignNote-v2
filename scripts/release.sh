#!/bin/bash

# 确保脚本发生任何错误时立刻退出
set -e

# 获取当前 Git 分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "====================================================="
echo "⚙️  SovereignNote 本地一键 Release 触发助手"
echo "====================================================="

# 确保当前工作区没有未提交的代码
if [ -n "$(git status --porcelain)" ]; then
    echo "⚠️  检测到当前工作区有未提交的改动，请先 commit 或 stash 您的代码！"
    exit 1
fi

# 提示输入新的版本号
read -p "请输入您要发布的新版本号 (例如: v2.1.0): " VERSION

# 简单验证版本号格式
if [[ ! $VERSION =~ ^v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    echo "❌ 格式不正确！版本号必须以 'v' 开头，后面跟着主客版本（如 v2.0.0）。"
    exit 1
fi

# 检查本地是否已经存在该 tag
if git rev-parse "$VERSION" >/dev/null 2>&1; then
    echo "❌ 错误: 本地已经存在标签 '$VERSION'，请使用更高版本号！"
    exit 1
fi

echo "====================================================="
echo "🚀 正在将最新代码推送至 $CURRENT_BRANCH 分支..."
git push origin "$CURRENT_BRANCH"

echo "🏷️  正在本地创建标签: $VERSION ..."
git tag -a "$VERSION" -m "Release $VERSION"

echo "📤 正在推送标签至 GitHub 远程端..."
git push origin "$VERSION"

echo "====================================================="
echo "🎉 恭喜！代码和标签推送成功！"
echo "🌟 自动发布流水线已被激活。请前往 GitHub 存储库的 Actions 页面查看实时编译与自动发布状态。"
echo "====================================================="
