#!/usr/bin/env bash
# =============================================================================
# clash-ctrl — shell 集成脚本
# =============================================================================
# 作用：在当前 shell 会话中提供 clash-ctrl 的快捷函数，
#       完全替代原 clashctl.sh 中的 clash/clashon/clashoff 等旧命令。
#
# 安装（在 ~/.bashrc 或 ~/.zshrc 末尾添加）：
#   source /path/to/clash-ctrl/scripts/shell-integration.sh
#
# 如果原来有 clashctl.sh，把原来那行替换掉：
#   # 旧：source /opt/clash/script/common.sh && source /opt/clash/script/clashctl.sh && watch_proxy
#   # 新：source /path/to/clash-ctrl/scripts/shell-integration.sh
# =============================================================================

# ── clash-ctrl 路径（自动检测）────────────────────────────────────────────────
_CLASH_CTRL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd)"
# 优先用绝对路径（兼容非登录 shell，如 MCSM 启动环境）
# 按优先级查找 bun：显式绝对路径 > BUN_INSTALL 环境变量 > $HOME > PATH
# 查找 bun 可执行文件（兼容非登录 shell，如 MCSM，$HOME 可能为空）
# 优先级：BUN_INSTALL 环境变量 > $HOME > PATH > 遍历 /home/* 所有用户
_BUN_BIN=""
_find_bun() {
    local c
    [[ -n "$BUN_INSTALL" && -x "$BUN_INSTALL/bin/bun" ]] && { echo "$BUN_INSTALL/bin/bun"; return; }
    [[ -n "$HOME"        && -x "$HOME/.bun/bin/bun"   ]] && { echo "$HOME/.bun/bin/bun";   return; }
    c="$(command -v bun 2>/dev/null)"; [[ -x "$c" ]] && { echo "$c"; return; }
    for c in /home/*/.bun/bin/bun /root/.bun/bin/bun; do
        [[ -x "$c" ]] && { echo "$c"; return; }
    done
}
_BUN_BIN="$(_find_bun)"; unset -f _find_bun
[[ -z "$_BUN_BIN" ]] && _BUN_BIN="bun"  # last resort
_CLASH_CTRL_BIN="$_BUN_BIN run --cwd $_CLASH_CTRL_DIR cli/index.ts"

# ── 系统代理管理（clashon/clashoff 保留的核心功能）───────────────────────────
_clash_ctrl_set_proxy() {
    local port="${1:-7890}"
    export http_proxy="http://127.0.0.1:${port}"
    export https_proxy="$http_proxy"
    export HTTP_PROXY="$http_proxy"
    export HTTPS_PROXY="$http_proxy"
    export all_proxy="socks5h://127.0.0.1:${port}"
    export ALL_PROXY="$all_proxy"
    export no_proxy="localhost,127.0.0.1,::1"
    export NO_PROXY="$no_proxy"
}

_clash_ctrl_unset_proxy() {
    unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
    unset all_proxy ALL_PROXY no_proxy NO_PROXY
}

_clash_ctrl_get_port() {
    # 从 runtime.yaml 读 mixed-port
    local port
    port=$(sudo /opt/clash/bin/yq '.mixed-port // 7890' /opt/clash/runtime.yaml 2>/dev/null) || port=7890
    echo "$port"
}

# ── 新版快捷命令 ──────────────────────────────────────────────────────────────

# clashon：启动服务 + 设置环境变量代理
clashon() {
    if ! systemctl is-active mihomo &>/dev/null; then
        sudo systemctl start mihomo || { echo "❌ 启动失败"; return 1; }
    fi
    local port
    port=$(_clash_ctrl_get_port)
    _clash_ctrl_set_proxy "$port"
    echo "✓ 代理已开启 → http://127.0.0.1:${port}"
}

# clashoff：停止服务 + 清除环境变量代理
clashoff() {
    sudo systemctl stop mihomo
    _clash_ctrl_unset_proxy
    echo "✓ 代理已关闭"
}

# clashrestart：重启服务（不改变代理环境变量）
clashrestart() {
    sudo systemctl restart mihomo && echo "✓ mihomo 已重启"
}

# clashstatus：服务状态
clashstatus() {
    sudo systemctl status mihomo "$@"
}

# clashtun：TUN 模式管理（转发给 clash-ctrl）
clashtun() {
    case "$1" in
        on)     $_CLASH_CTRL_BIN tun on ;;
        off)    $_CLASH_CTRL_BIN tun off ;;
        *)      $_CLASH_CTRL_BIN tun status ;;
    esac
}

# clashupdate：订阅更新（转发给 clash-ctrl）
clashupdate() {
    if [[ -n "$1" && "$1" != "log" && "$1" != "auto" ]]; then
        $_CLASH_CTRL_BIN sub update "$1"
    elif [[ "$1" == "log" ]]; then
        sudo tail /opt/clash/clashupdate.log 2>/dev/null || echo "暂无更新日志"
    else
        $_CLASH_CTRL_BIN sub reload
    fi
}

# clashmixin：mixin 配置查看/编辑
clashmixin() {
    case "$1" in
        -e) sudo vim /opt/clash/mixin.yaml && clashrestart ;;
        -r) less /opt/clash/runtime.yaml ;;
        *)  $_CLASH_CTRL_BIN mixin ;;
    esac
}

# clashproxy：系统代理开关（不重启服务）
clashproxy() {
    case "$1" in
        on)
            systemctl is-active mihomo &>/dev/null || { echo "❌ mihomo 未运行，请先 clashon"; return 1; }
            local port
            port=$(_clash_ctrl_get_port)
            _clash_ctrl_set_proxy "$port"
            echo "✓ 系统代理已开启 → http://127.0.0.1:${port}"
            ;;
        off)
            _clash_ctrl_unset_proxy
            echo "✓ 系统代理已关闭"
            ;;
        status|*)
            if [[ -n "$http_proxy" ]]; then
                echo "✓ 系统代理：开启  http_proxy=$http_proxy"
            else
                echo "✗ 系统代理：关闭"
            fi
            ;;
    esac
}

# clash / mihomo：统一入口（兼容旧习惯）
clash() {
    case "$1" in
        on)              clashon ;;
        off)             clashoff ;;
        restart)         clashrestart ;;
        status)          shift; clashstatus "$@" ;;
        proxy)           shift; clashproxy "$@" ;;
        tun)             shift; clashtun "$@" ;;
        mixin)           shift; clashmixin "$@" ;;
        update)          shift; clashupdate "$@" ;;
        # ── 以下是 clash-ctrl 新增功能 ──
        proxy-list)      $_CLASH_CTRL_BIN proxy list ;;
        proxy-use)       shift; $_CLASH_CTRL_BIN proxy use "$@" ;;
        rule)            shift; $_CLASH_CTRL_BIN rule "$@" ;;
        dns)             shift; $_CLASH_CTRL_BIN dns "$@" ;;
        connections)     shift; $_CLASH_CTRL_BIN connections "$@" ;;
        sub)             shift; $_CLASH_CTRL_BIN sub "$@" ;;
        config)          $_CLASH_CTRL_BIN config ;;
        *)
            cat <<EOF
用法: clash COMMAND [OPTION]

基础命令（兼容旧版）：
  on                      开启服务 + 设置系统代理
  off                     关闭服务 + 清除系统代理
  restart                 重启服务
  proxy    [on|off|status] 系统代理环境变量
  status                  服务状态
  tun      [on|off]       TUN 模式
  mixin    [-e|-r]        Mixin 配置 (编辑/查看runtime)
  update   [url|log]      更新订阅

clash-ctrl 新增命令：
  proxy-list              节点/代理组列表
  proxy-use <group> <node> 切换节点
  rule     [list|add|del] 规则管理
  dns      [query|filter] DNS 查询/fake-ip管理
  connections             活跃连接
  sub      [show|reload]  订阅管理
  config                  运行时配置摘要
EOF
            ;;
    esac
}

mihomo() { clash "$@"; }
mihomoctl() { clash "$@"; }
clashctl() { clash "$@"; }

# ── 自动恢复代理环境变量（新 shell 打开时）────────────────────────────────────
_clash_ctrl_watch_proxy() {
    [[ -z "$http_proxy" ]] && [[ $- == *i* ]] && {
        systemctl is-active mihomo &>/dev/null && {
            local port
            port=$(_clash_ctrl_get_port)
            _clash_ctrl_set_proxy "$port"
        }
    }
}
_clash_ctrl_watch_proxy
