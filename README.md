# clash-ctrl

> Mihomo/Clash Meta controller — CLI tool & MCP server for AI-driven proxy management

在 [nelvko/clash-for-linux-install](https://github.com/nelvko/clash-for-linux-install) 的基础上，为其提供结构化的 **命令行工具（CLI）** 与 **MCP Server** 扩展层，让 AI 可以直接调用接口管理代理，同时完整兼容原有的 `clash` / `clashon` / `clashupdate` 等 shell 命令习惯。

---

## 架构关系

```
nelvko/clash-for-linux-install   ← 底层安装脚本（mihomo 内核、yq、subconverter）
           │
           ↓ 安装后生成 /opt/clash/
clash-ctrl（本仓库）
   ├── core/          TypeScript 封装层（REST API + mixin 读写）
   ├── cli/           clash-ctrl 命令行工具
   ├── mcp/           MCP Server（供 AI 调用）
   └── scripts/
       ├── setup-sudo.sh          一键配置免密 sudo 权限
       └── shell-integration.sh   替代旧 clashctl.sh 的 shell 函数集
```

**本仓库不包含**：mihomo 内核、yq、订阅转换器，这些由上游仓库负责安装。

---

## 前置条件

1. 已通过 [nelvko/clash-for-linux-install](https://github.com/nelvko/clash-for-linux-install) 完成 clash 安装（默认路径 `/opt/clash`）
2. [Bun](https://bun.sh) >= 1.0

---

## 快速开始

### 1. 克隆并安装依赖

```bash
git clone https://github.com/youyli03/clash-ctrl.git
cd clash-ctrl
bun install
```

### 2. 配置免密 sudo（运行一次）

clash-ctrl 写入 `/opt/clash/` 下的文件需要 root 权限，运行授权脚本自动配置最小权限白名单：

```bash
bash scripts/setup-sudo.sh
```

脚本只在 `/etc/sudoers.d/clash-ctrl` 写入以下白名单，**不涉及任何密钥或订阅链接**：

| 权限 | 命令 |
|------|------|
| yq 配置读写 | `sudo /opt/clash/bin/yq *` |
| mihomo 配置验证 | `sudo /opt/clash/bin/mihomo *` |
| 服务管理 | `sudo systemctl restart/start/stop/status mihomo` |
| 文件写入 | `sudo tee /opt/clash/{mixin,runtime,config}.yaml` |
| 配置备份回滚 | `sudo cp /opt/clash/config.yaml{,.bak}` |

### 3. 替换旧 shell 命令（可选）

如果之前已用 `clash-for-linux-install`，`~/.bashrc` 里有这一行：

```bash
# 旧版（clashctl.sh）
source /opt/clash/script/common.sh && source /opt/clash/script/clashctl.sh && watch_proxy
```

替换为：

```bash
# 新版（clash-ctrl shell 集成）
source /path/to/clash-ctrl/scripts/shell-integration.sh
```

然后 `source ~/.bashrc` 生效。所有旧命令保持兼容，无需改变使用习惯。

---

## Shell 命令（兼容旧版 + 新增）

`scripts/shell-integration.sh` 提供以下 shell 函数，**完整替代原 `clashctl.sh`**：

### 基础命令（与旧版行为一致）

```bash
clashon                   # 启动 mihomo + 设置系统代理环境变量
clashoff                  # 停止 mihomo + 清除系统代理环境变量
clashrestart              # 重启 mihomo 服务
clashstatus               # 查看服务状态（systemctl status）
clashproxy on/off/status  # 仅切换代理环境变量（不重启服务）
clashtun on/off           # TUN 模式开关
clashupdate [url]         # 订阅更新（不传 url 则重用已保存的链接）
clashupdate log           # 查看更新日志
clashmixin                # 查看 mixin.yaml
clashmixin -e             # 编辑 mixin.yaml（vim）
clashmixin -r             # 查看 runtime.yaml
```

### 统一入口（与旧版兼容）

```bash
clash on/off/restart/status/tun/mixin/update/proxy ...
mihomo ...    # 同 clash
```

### 新增命令

```bash
clash proxy-list                 # 列出所有节点和代理组
clash proxy-use <group> <node>   # 切换节点
clash rule list/add/del          # 规则管理
clash dns query/filter           # DNS 查询 / fake-ip 管理
clash connections                # 活跃连接
clash sub show/reload/update     # 订阅管理
clash config                     # 运行时配置摘要
```

---

## clash-ctrl CLI

直接使用 `clash-ctrl` 命令（不需要 source 脚本）：

```bash
# 节点管理
clash-ctrl proxy list                     # 列出所有代理组和节点
clash-ctrl proxy group [groupName]        # 查看指定代理组
clash-ctrl proxy use <group> <node>       # 切换节点

# 规则管理
clash-ctrl rule list                      # 查看所有规则
clash-ctrl rule add <domain>              # 添加直连规则
clash-ctrl rule del <payload>             # 删除规则

# TUN 模式
clash-ctrl tun status                     # 查看 TUN 状态
clash-ctrl tun on / off                   # 开启 / 关闭 TUN

# DNS
clash-ctrl dns query <hostname>           # DNS 解析
clash-ctrl dns filter add <domain>        # 添加 fake-ip 例外
clash-ctrl dns filter del <domain>        # 删除 fake-ip 例外

# 连接管理
clash-ctrl connections                    # 查看活跃连接
clash-ctrl connections --close-all        # 断开所有连接

# 订阅管理
clash-ctrl sub update <url>               # 导入新订阅并更新（下载→验证→merge→重启）
clash-ctrl sub reload                     # 重新拉取已保存的订阅
clash-ctrl sub show                       # 查看当前订阅 URL

# 配置查看
clash-ctrl mixin                          # 查看 mixin.yaml 内容
clash-ctrl config                         # 查看运行时配置摘要
```

---

## MCP Server（AI 工具调用）

适配 [tinyclaw](https://github.com/youyli03/tinyclaw) / 任何 MCP 兼容客户端。

在 `~/.tinyclaw/mcp.toml` 中添加：

```toml
[servers.clash-ctrl]
command = "bun"
args = ["run", "/path/to/clash-ctrl/mcp/index.ts"]
description = "Mihomo/Clash Meta controller MCP server"
```

可用工具（AI 可直接调用）：

| 工具名 | 说明 |
|--------|------|
| `proxy_list` | 列出节点和代理组 |
| `proxy_switch` | 切换代理组节点 |
| `rule_list` | 查看规则 |
| `rule_add` | 添加直连/代理规则 |
| `rule_del` | 删除规则 |
| `tun_status` | 查看 TUN 状态 |
| `tun_set` | 开关 TUN |
| `dns_query` | DNS 解析查询 |
| `dns_filter_add` | 添加 fake-ip 例外 |
| `dns_filter_del` | 删除 fake-ip 例外 |
| `connections_list` | 查看活跃连接 |
| `connections_close` | 关闭连接（单个/全部）|
| `sub_update` | 更新订阅 |
| `mixin_get` | 读取 mixin.yaml |
| `config_get` | 读取运行时配置摘要 |

---

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLASH_BASE` | `/opt/clash` | clash 安装目录（与上游安装脚本一致） |
| `CLASH_SERVICE` | `mihomo` | systemd 服务名 |

---

## 安全说明

- 订阅 URL 只允许 `http://` / `https://`，禁止 `file://` 等本地协议
- HTTP API 路径参数均做 `encodeURIComponent` 转义，无路径注入
- `sudo` 调用全部使用数组参数（非 shell 字符串拼接），无命令注入
- API Secret 在 CLI 输出时自动遮码
- sudoers 白名单精确到具体文件路径，不授予宽泛权限

---

## Credits

- 底层安装脚本：[nelvko/clash-for-linux-install](https://github.com/nelvko/clash-for-linux-install)
- mihomo 内核：[MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo)
- MCP 协议：[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
