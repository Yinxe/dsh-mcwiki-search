#!/usr/bin/env bash
# mcwiki-search 一键安装到 DSH profile（本机部署用）。
#
# 用法: ./scripts/install-web.sh [profile]
#   默认 profile=web；会把插件链接进 <DSH_HOME>/profiles/<profile>/node_modules
#   并在 cordis.patch.yml 追加挂载行（幂等，重复执行安全）。
#
# 说明：DSH_HOME 默认 ~/.dsh；插件本体即本目录，软链后源码改动即时生效。
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_NAME="$(node -p "require('${PLUGIN_DIR}/package.json').name")"
PROFILE="${1:-web}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"

if [ ! -d "$PROFILE_DIR" ]; then
  echo "❌ profile 不存在: $PROFILE_DIR" >&2
  exit 1
fi

echo "▶ 安装 $PLUGIN_NAME → profile「$PROFILE」"
echo "  插件目录: $PLUGIN_DIR"

# 1. 声明为 profile 依赖（本地 link；pnpm 重装后需重新运行本脚本）
if command -v pnpm >/dev/null 2>&1; then
  (cd "$PROFILE_DIR" && pnpm add --offline "$PLUGIN_NAME@link:$PLUGIN_DIR" >/dev/null 2>&1 || true)
fi

# 2. 显式软链（保证修改源码即时生效）
rm -rf "$PROFILE_DIR/node_modules/$PLUGIN_NAME"
ln -s "$PLUGIN_DIR" "$PROFILE_DIR/node_modules/$PLUGIN_NAME"
echo "  ✓ 软链: node_modules/$PLUGIN_NAME → $PLUGIN_DIR"

# 3. 幂等追加 cordis.patch.yml 挂载行（已有则跳过）
PATCH="$PROFILE_DIR/cordis.patch.yml"
if grep -q "id: $PLUGIN_NAME" "$PATCH" 2>/dev/null; then
  echo "  ✓ cordis.patch.yml 已包含挂载行，跳过"
else
  cat >> "$PATCH" <<EOF

# mcwiki-search 插件（一键安装脚本写入；重启 dsh $PROFILE 后生效）
- insert:
    - id: $PLUGIN_NAME
      name: $PLUGIN_NAME
EOF
  echo "  ✓ 已追加挂载行到 cordis.patch.yml"
fi

echo "✅ 完成。重启生效: dsh $PROFILE"
echo "   验证: 设置 → Minecraft Wiki 搜索；或对模型说「用 mcwiki_search 查一下苦力怕」"