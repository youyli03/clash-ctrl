#!/usr/bin/env bash
# =============================================================================
# clash-ctrl — sudoers 免密权限安装脚本
# =============================================================================
# 作用：为当前用户添加 sudo 免密权限，仅限 clash-ctrl 运行所需的最小命令集。
#
# 安全说明：
#   - 只允许对固定路径下的 clash 文件执行 yq/tee/cp 操作
#   - 只允许 restart/start/stop/status mihomo 服务
#   - 不授予 ALL=(ALL) ALL 等宽泛权限
#   - 不涉及任何密钥或订阅 URL
#
# 用法：
#   bash scripts/setup-sudo.sh
# =============================================================================

set -euo pipefail

# ── 配置（与 /opt/clash 安装路径保持一致）──────────────────────────────────
CLASH_BASE="${CLASH_BASE:-/opt/clash}"
SERVICE="${CLASH_SERVICE:-mihomo}"
CURRENT_USER="${SUDO_USER:-$(whoami)}"
SUDOERS_FILE="/etc/sudoers.d/clash-ctrl"

YQ_BIN="${CLASH_BASE}/bin/yq"
MIHOMO_BIN="${CLASH_BASE}/bin/mihomo"

# ── 颜色输出 ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
fail() { echo -e "${RED}✗${RESET} $*" >&2; exit 1; }

# ── 前置检查 ──────────────────────────────────────────────────────────────────
echo "=== clash-ctrl sudo 权限配置 ==="
echo "目标用户 : $CURRENT_USER"
echo "clash 目录: $CLASH_BASE"
echo "服务名称 : $SERVICE"
echo ""

# 必须以 root 运行（或已有 sudo）
if [[ $EUID -ne 0 ]]; then
  warn "当前非 root，尝试 sudo 重新运行..."
  exec sudo CLASH_BASE="$CLASH_BASE" CLASH_SERVICE="$SERVICE" bash "$0" "$@"
fi

# 检查 clash 目录是否存在
[[ -d "$CLASH_BASE" ]] || fail "clash 目录不存在: $CLASH_BASE（请先安装 clash-for-linux）"
[[ -f "$YQ_BIN" ]]    || fail "yq 不存在: $YQ_BIN"
[[ -f "$MIHOMO_BIN" ]] || fail "mihomo 不存在: $MIHOMO_BIN"

# ── 生成 sudoers 内容 ────────────────────────────────────────────────────────
SUDOERS_CONTENT="# clash-ctrl: 允许 ${CURRENT_USER} 免密执行 clash 相关系统操作
# 由 scripts/setup-sudo.sh 自动生成 — $(date '+%Y-%m-%d %H:%M:%S')

Cmnd_Alias CLASH_YQ      = ${YQ_BIN} *
Cmnd_Alias CLASH_MIHOMO  = ${MIHOMO_BIN} *
Cmnd_Alias CLASH_SERVICE = /usr/bin/systemctl restart ${SERVICE}, \\
                           /usr/bin/systemctl start ${SERVICE},   \\
                           /usr/bin/systemctl stop ${SERVICE},    \\
                           /usr/bin/systemctl status ${SERVICE}
Cmnd_Alias CLASH_TEE     = /usr/bin/tee ${CLASH_BASE}/mixin.yaml,   \\
                           /usr/bin/tee ${CLASH_BASE}/runtime.yaml,  \\
                           /usr/bin/tee ${CLASH_BASE}/config.yaml,   \\
                           /usr/bin/tee ${CLASH_BASE}/url
Cmnd_Alias CLASH_CP      = /usr/bin/cp ${CLASH_BASE}/config.yaml ${CLASH_BASE}/config.yaml.bak, \\
                           /usr/bin/cp ${CLASH_BASE}/config.yaml.bak ${CLASH_BASE}/config.yaml

${CURRENT_USER} ALL=(ALL) NOPASSWD: CLASH_YQ, CLASH_MIHOMO, CLASH_SERVICE, CLASH_TEE, CLASH_CP
"

# ── 写入并验证 ────────────────────────────────────────────────────────────────
echo "$SUDOERS_CONTENT" > "$SUDOERS_FILE"
chmod 440 "$SUDOERS_FILE"

# 用 visudo -c 验证语法，失败则删除避免锁死
if ! visudo -c -f "$SUDOERS_FILE" &>/dev/null; then
  rm -f "$SUDOERS_FILE"
  fail "sudoers 语法验证失败，已回滚。请提交 issue 并附上系统信息。"
fi

ok "sudoers 文件已写入: $SUDOERS_FILE"
ok "权限验证通过"
echo ""
echo "授权命令列表："
echo "  sudo ${YQ_BIN} *                        — yq 配置读写"
echo "  sudo ${MIHOMO_BIN} *                    — mihomo 配置验证"
echo "  sudo systemctl [restart|start|stop|status] ${SERVICE}"
echo "  sudo tee ${CLASH_BASE}/{mixin,runtime,config}.yaml"
echo "  sudo cp ${CLASH_BASE}/config.yaml{,.bak} (双向)"
echo ""
ok "clash-ctrl 所有写操作现在无需输入密码"
echo ""
echo "验证方式（可选）："
echo "  sudo -l -U $CURRENT_USER | grep CLASH"
