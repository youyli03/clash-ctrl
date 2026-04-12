#!/usr/bin/env bun
/**
 * clash-ctrl MCP Server
 *
 * 工具前缀: clash_*
 * 启动: bun run /home/lyy/clash-ctrl/mcp/index.ts
 * 注册: ~/.tinyclaw/mcp.toml [servers.clash]
 *
 * 工具列表:
 *   clash_proxy_list       — 列出所有代理组和节点
 *   clash_proxy_switch     — 切换代理组节点
 *   clash_proxy_check      — 触发健康检查
 *   clash_rule_list        — 查看运行时规则
 *   clash_rule_add         — 添加直连规则到 mixin（自动重启）
 *   clash_rule_del         — 删除 mixin 规则（自动重启）
 *   clash_tun_status       — 查看 TUN 状态
 *   clash_tun_set          — 开关 TUN（自动重启）
 *   clash_dns_query        — DNS 解析查询
 *   clash_dns_filter_list  — 查看 fake-ip-filter
 *   clash_dns_filter_add   — 添加 fake-ip-filter 域名
 *   clash_dns_filter_del   — 删除 fake-ip-filter 域名
 *   clash_connections_list — 查看活跃连接
 *   clash_connections_close— 关闭连接（单个或全部）
 *   clash_sub_update       — 更新订阅
 *   clash_mixin_get        — 读取 mixin.yaml 原文
 *   clash_config_get       — 读取运行时配置摘要
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "node:fs";

import { getConfig } from "../core/config.ts";
import { ClashAPI } from "../core/api.ts";
import { ClashMixin } from "../core/mixin.ts";
import { listProxies, getProxyGroups, getRealProxies, switchProxy, healthcheck, listProviders } from "../core/operations/proxies.ts";
import { listRules, addDirectRule, removeRule } from "../core/operations/rules.ts";
import { getTunStatus, setTun } from "../core/operations/tun.ts";
import { dnsQuery, getFakeIpFilter, addFakeIpFilter, removeFakeIpFilter } from "../core/operations/dns.ts";
import { listConnections, closeConnection, closeAllConnections } from "../core/operations/connections.ts";
import { updateSubscription } from "../core/operations/update.ts";

// ── 工具定义 ──────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "clash_proxy_list",
    description: "列出所有 Clash 代理组和节点。返回 JSON，包含 groups（代理组列表，含当前节点）和 nodes（所有真实节点）。",
    inputSchema: {
      type: "object",
      properties: {
        include_nodes: {
          type: "boolean",
          description: "是否包含所有真实节点列表，默认 false（只返回代理组）",
        },
      },
    },
  },
  {
    name: "clash_proxy_switch",
    description: "切换指定代理组的当前节点。常用于切换 GLOBAL、一分机场 等 Selector 类型代理组。",
    inputSchema: {
      type: "object",
      properties: {
        group: { type: "string", description: "代理组名称，如 'GLOBAL' 或 '一分机场'" },
        proxy: { type: "string", description: "目标节点名称" },
      },
      required: ["group", "proxy"],
    },
  },
  {
    name: "clash_proxy_check",
    description: "触发健康检查（测速）。可指定 provider 名称，或不传对所有 provider 测速。",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "provider 名称，不填则全部测速" },
      },
    },
  },
  {
    name: "clash_rule_list",
    description: "查看当前运行时规则列表。返回 JSON 数组，每项含 type/payload/proxy。",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "最多返回条数，默认 100" },
      },
    },
  },
  {
    name: "clash_rule_add",
    description: "添加规则到 mixin.yaml 并自动重启 mihomo。默认生成 DOMAIN,<domain>,DIRECT 格式。",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "域名，如 'example.com'" },
        proxy: { type: "string", description: "目标代理，默认 DIRECT" },
        comment: { type: "string", description: "可选注释" },
      },
      required: ["domain"],
    },
  },
  {
    name: "clash_rule_del",
    description: "从 mixin.yaml 删除包含指定 payload 的规则并自动重启 mihomo。",
    inputSchema: {
      type: "object",
      properties: {
        payload: { type: "string", description: "规则 payload，如域名或端口" },
      },
      required: ["payload"],
    },
  },
  {
    name: "clash_tun_status",
    description: "查看当前 TUN 模式状态（已开启/已关闭）。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "clash_tun_set",
    description: "开启或关闭 TUN 模式。修改 mixin.yaml 并自动重启 mihomo，需要 sudo 权限。",
    inputSchema: {
      type: "object",
      properties: {
        enable: { type: "boolean", description: "true=开启 false=关闭" },
      },
      required: ["enable"],
    },
  },
  {
    name: "clash_dns_query",
    description: "通过 Clash DNS 解析域名，返回解析结果（IP/TTL）。",
    inputSchema: {
      type: "object",
      properties: {
        hostname: { type: "string", description: "要解析的域名" },
        type: { type: "string", description: "记录类型：A/AAAA/CNAME/MX，默认 A" },
      },
      required: ["hostname"],
    },
  },
  {
    name: "clash_dns_filter_list",
    description: "查看 mixin.yaml 中的 fake-ip-filter 列表（这些域名不走 fake-ip，直接真实解析）。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "clash_dns_filter_add",
    description: "添加域名到 fake-ip-filter（该域名不走 fake-ip），修改 mixin 并重启。",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "域名，如 'm1saka.cc'" },
      },
      required: ["domain"],
    },
  },
  {
    name: "clash_dns_filter_del",
    description: "从 fake-ip-filter 移除域名，修改 mixin 并重启。",
    inputSchema: {
      type: "object",
      properties: {
        domain: { type: "string", description: "要移除的域名" },
      },
      required: ["domain"],
    },
  },
  {
    name: "clash_connections_list",
    description: "查看当前所有活跃连接，返回连接数、总流量和连接详情列表。",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "最多返回连接数，默认 30" },
      },
    },
  },
  {
    name: "clash_connections_close",
    description: "关闭连接。传 id 关闭单个，不传 id 且 close_all=true 关闭全部。",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "连接 ID（从 clash_connections_list 获取）" },
        close_all: { type: "boolean", description: "是否关闭全部连接" },
      },
    },
  },
  {
    name: "clash_sub_update",
    description: "更新订阅配置。下载新配置 → 验证 → 合并 → 重启 mihomo。",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "订阅链接（https://...）或 file:///path/to/config.yaml" },
      },
      required: ["url"],
    },
  },
  {
    name: "clash_mixin_get",
    description: "读取 mixin.yaml 的完整内容（YAML 格式字符串）。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "clash_config_get",
    description: "读取运行时配置摘要：API 地址、secret、混合端口、TUN 状态、模式等。",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

// ── 工具执行 ──────────────────────────────────────────────────────────────────

function getCtx() {
  const cfg = getConfig();
  const api = new ClashAPI(cfg.controller, cfg.secret);
  const mixin = new ClashMixin(cfg);
  return { cfg, api, mixin };
}

function ok(data: unknown): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(msg: string): { content: { type: "text"; text: string }[]; isError: true } {
  return { content: [{ type: "text", text: `ERROR: ${msg}` }], isError: true };
}

async function callTool(name: string, args: Record<string, unknown>) {
  const { cfg, api, mixin } = getCtx();

  switch (name) {
    case "clash_proxy_list": {
      const groups = await getProxyGroups(api);
      const result: Record<string, unknown> = { groups };
      if (args["include_nodes"]) {
        result["nodes"] = await getRealProxies(api);
      }
      return ok(result);
    }

    case "clash_proxy_switch": {
      const group = args["group"] as string;
      const proxy = args["proxy"] as string;
      await switchProxy(api, group, proxy);
      return ok({ success: true, group, switched_to: proxy });
    }

    case "clash_proxy_check": {
      const provider = args["provider"] as string | undefined;
      if (provider) {
        await healthcheck(api, provider);
        return ok({ success: true, provider });
      } else {
        const providers = await listProviders(api);
        for (const p of providers) await healthcheck(api, p);
        return ok({ success: true, providers });
      }
    }

    case "clash_rule_list": {
      const limit = (args["limit"] as number | undefined) ?? 100;
      const rules = await listRules(api);
      return ok({ total: rules.length, rules: rules.slice(0, limit) });
    }

    case "clash_rule_add": {
      const domain = args["domain"] as string;
      const proxy = (args["proxy"] as string | undefined) ?? "DIRECT";
      const comment = args["comment"] as string | undefined;
      addDirectRule(mixin, domain, proxy, comment);
      return ok({ success: true, rule: `DOMAIN,${domain},${proxy}`, restarted: true });
    }

    case "clash_rule_del": {
      const payload = args["payload"] as string;
      const removed = removeRule(mixin, payload);
      return ok({ success: removed, payload, restarted: removed });
    }

    case "clash_tun_status": {
      const enabled = await getTunStatus(api);
      return ok({ tun_enabled: enabled });
    }

    case "clash_tun_set": {
      const enable = args["enable"] as boolean;
      setTun(mixin, enable);
      return ok({ success: true, tun_enabled: enable, restarted: true });
    }

    case "clash_dns_query": {
      const hostname = args["hostname"] as string;
      const type = (args["type"] as string | undefined) ?? "A";
      const result = await dnsQuery(api, hostname, type);
      return ok(result);
    }

    case "clash_dns_filter_list": {
      const filter = getFakeIpFilter(mixin);
      return ok({ fake_ip_filter: filter, count: filter.length });
    }

    case "clash_dns_filter_add": {
      const domain = args["domain"] as string;
      addFakeIpFilter(mixin, domain);
      return ok({ success: true, domain, restarted: true });
    }

    case "clash_dns_filter_del": {
      const domain = args["domain"] as string;
      const removed = removeFakeIpFilter(mixin, domain);
      return ok({ success: removed, domain, restarted: removed });
    }

    case "clash_connections_list": {
      const limit = (args["limit"] as number | undefined) ?? 30;
      const { connections, downloadTotal, uploadTotal } = await listConnections(api);
      return ok({
        total: connections.length,
        downloadTotal,
        uploadTotal,
        connections: connections.slice(0, limit),
      });
    }

    case "clash_connections_close": {
      const id = args["id"] as string | undefined;
      const closeAll = args["close_all"] as boolean | undefined;
      if (id) {
        await closeConnection(api, id);
        return ok({ success: true, closed_id: id });
      } else if (closeAll) {
        await closeAllConnections(api);
        return ok({ success: true, closed: "all" });
      } else {
        return fail("请提供 id 或设置 close_all=true");
      }
    }

    case "clash_sub_update": {
      const url = args["url"] as string;
      await updateSubscription(url, cfg);
      return ok({ success: true, url, restarted: true });
    }

    case "clash_mixin_get": {
      const content = fs.readFileSync(cfg.mixinPath, "utf-8");
      return ok({ path: cfg.mixinPath, content });
    }

    case "clash_config_get": {
      const rawCfg = await api.get<Record<string, unknown>>("/configs");
      return ok({
        controller: cfg.controller,
        mixin_path: cfg.mixinPath,
        runtime_path: cfg.runtimePath,
        service: cfg.service,
        mixed_port: rawCfg["mixed-port"],
        mode: rawCfg["mode"],
        tun_enable: (rawCfg["tun"] as Record<string, unknown> | undefined)?.["enable"],
        allow_lan: rawCfg["allow-lan"],
      });
    }

    default:
      return fail(`未知工具: ${name}`);
  }
}

// ── MCP Server 启动 ───────────────────────────────────────────────────────────

const server = new Server(
  { name: "clash-ctrl", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    return await callTool(name, args as Record<string, unknown>);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
