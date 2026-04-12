# clash-ctrl

> Mihomo/Clash Meta controller — CLI tool & MCP server for AI-driven proxy management

统一管理 Mihomo/Clash Meta 的命令行工具 + MCP Server，支持节点切换、规则管理、TUN/DNS 配置、订阅更新。

---

## 前置条件

- [clash-for-linux](https://github.com/clash-for-linux/clash-for-linux) 已安装（默认路径 `/opt/clash`）
- [Bun](https://bun.sh) >= 1.0

---

## 安装

```bash
git clone https://github.com/youyli03/clash-ctrl.git
cd clash-ctrl
bun install
```

### 配置免密 sudo（必须）

clash-ctrl 需要写入 `/opt/clash/` 下的配置文件（属 root），运行一次授权脚本：

```bash
bash scripts/setup-sudo.sh
# 或
bun run setup-sudo
```

**脚本只做一件事**：在 `/etc/sudoers.d/clash-ctrl` 写入最小权限白名单，
允许当前用户对以下命令免密 sudo：

| 权限范围 | 具体命令 |
|----------|----------|
| yq 读写配置 | `sudo /opt/clash/bin/yq *` |
| mihomo 配置验证 | `sudo /opt/clash/bin/mihomo *` |
| 服务管理 | `sudo systemctl restart/start/stop/status mihomo` |
| 文件写入 | `sudo tee /opt/clash/{mixin,runtime,config}.yaml` |
| 配置备份/回滚 | `sudo cp /opt/clash/config.yaml{,.bak}` |

> **不涉及**：API Key、订阅链接、任何私有凭证。

---

## CLI 用法

```bash
# 节点管理
clash-ctrl proxy list                    # 列出所有代理组和节点
clash-ctrl proxy group [groupName]       # 查看指定代理组
clash-ctrl proxy use <group> <node>      # 切换节点

# 规则管理
clash-ctrl rule list                     # 查看所有规则
clash-ctrl rule add <domain>             # 添加直连规则
clash-ctrl rule del <payload>            # 删除规则

# TUN 模式
clash-ctrl tun status                    # 查看 TUN 状态
clash-ctrl tun on                        # 开启 TUN
clash-ctrl tun off                       # 关闭 TUN

# DNS
clash-ctrl dns query <hostname>          # DNS 解析
clash-ctrl dns filter add <domain>       # 添加 fake-ip 例外
clash-ctrl dns filter del <domain>       # 删除 fake-ip 例外

# 连接管理
clash-ctrl connections                   # 查看活跃连接
clash-ctrl connections --close-all       # 断开所有连接

# 订阅管理
clash-ctrl sub update <url>              # 导入新订阅并更新
clash-ctrl sub reload                    # 重新拉取已保存的订阅
clash-ctrl sub show                      # 查看当前订阅 URL

# 配置查看
clash-ctrl mixin                         # 查看 mixin.yaml 内容
clash-ctrl config                        # 查看运行时配置摘要
```

---

## MCP Server（AI 工具调用）

适配 [tinyclaw](https://github.com/youyli03/tinyclaw) / 任何 MCP 兼容客户端。

```bash
# 注册到 tinyclaw（~/.tinyclaw/mcp.toml）
[servers.clash-ctrl]
command = "bun"
args = ["run", "/path/to/clash-ctrl/mcp/index.ts"]
description = "Mihomo/Clash Meta controller MCP server"
```

MCP 工具列表：`proxy_list` / `proxy_switch` / `rule_list` / `rule_add` / `rule_del` /
`tun_status` / `tun_set` / `dns_query` / `dns_filter_add` / `dns_filter_del` /
`connections_list` / `connections_close` / `sub_update` / `mixin_get` / `config_get`

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLASH_BASE` | `/opt/clash` | clash 安装目录 |
| `CLASH_SERVICE` | `mihomo` | systemd 服务名 |

---

## 安全说明

- 订阅 URL 只允许 `http://` / `https://`，禁止 `file://` 等本地协议
- HTTP API 路径参数均做 `encodeURIComponent` 转义
- `sudo` 调用全部使用数组参数（非 shell 字符串拼接），无命令注入风险
- API Secret 在 CLI 输出时自动遮码
