#!/usr/bin/env bun
/**
 * clash-ctrl CLI
 *
 * 用法示例:
 *   clash-ctrl proxy list
 *   clash-ctrl proxy use "🇯🇵日本1号"
 *   clash-ctrl proxy group "一分机场"
 *   clash-ctrl rule list
 *   clash-ctrl rule add example.com
 *   clash-ctrl rule del example.com
 *   clash-ctrl tun status
 *   clash-ctrl tun on
 *   clash-ctrl tun off
 *   clash-ctrl dns query google.com
 *   clash-ctrl dns filter list
 *   clash-ctrl dns filter add m1saka.cc
 *   clash-ctrl dns filter del m1saka.cc
 *   clash-ctrl connections
 *   clash-ctrl connections --close-all
 *   clash-ctrl sub update <url>
 *   clash-ctrl mixin
 *   clash-ctrl config
 */

import { Command } from "commander";
import { getConfig } from "../core/config.ts";
import { ClashAPI } from "../core/api.ts";
import { ClashMixin } from "../core/mixin.ts";
import { listProxies, getProxyGroups, getRealProxies, switchProxy, healthcheck, listProviders } from "../core/operations/proxies.ts";
import { listRules, addDirectRule, removeRule } from "../core/operations/rules.ts";
import { getTunStatus, setTun } from "../core/operations/tun.ts";
import { dnsQuery, getFakeIpFilter, addFakeIpFilter, removeFakeIpFilter } from "../core/operations/dns.ts";
import { listConnections, closeConnection, closeAllConnections } from "../core/operations/connections.ts";
import { updateSubscription } from "../core/operations/update.ts";

// ── 辅助输出 ──────────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
};

function ok(msg: string) { console.log(`${C.green}✓${C.reset} ${msg}`); }
function err(msg: string) { console.error(`${C.red}✗${C.reset} ${msg}`); }
function info(msg: string) { console.log(`${C.cyan}→${C.reset} ${msg}`); }
function header(msg: string) { console.log(`\n${C.bold}${msg}${C.reset}`); }

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

function getCtx() {
  const cfg = getConfig();
  const api = new ClashAPI(cfg.controller, cfg.secret);
  const mixin = new ClashMixin(cfg);
  return { cfg, api, mixin };
}

// ── 主程序 ────────────────────────────────────────────────────────────────────

const program = new Command();

program
  .name("clash-ctrl")
  .description("Mihomo/Clash Meta controller — CLI & MCP")
  .version("0.1.0");

// ── proxy ─────────────────────────────────────────────────────────────────────

const proxy = program.command("proxy").description("代理节点管理");

proxy
  .command("list")
  .description("列出所有代理组和节点")
  .option("--all", "同时列出所有真实节点")
  .action(async (opts) => {
    const { api } = getCtx();
    const groups = await getProxyGroups(api);
    header("代理组");
    for (const g of groups) {
      const cur = g.now ? `${C.green}${g.now}${C.reset}` : `${C.gray}无${C.reset}`;
      console.log(`  ${C.bold}${g.name}${C.reset} [${g.type}] → ${cur}`);
      if (g.all && opts.all) {
        for (const n of g.all) {
          const mark = n === g.now ? ` ${C.green}←${C.reset}` : "";
          console.log(`    ${C.gray}•${C.reset} ${n}${mark}`);
        }
      }
    }
    if (opts.all) {
      const nodes = await getRealProxies(api);
      header("所有节点");
      for (const n of nodes) {
        console.log(`  ${C.gray}•${C.reset} ${n.name} ${C.gray}[${n.type}]${C.reset}`);
      }
    }
  });

proxy
  .command("use <name>")
  .description("切换代理组节点")
  .option("-g, --group <group>", "代理组名称（默认 GLOBAL）", "GLOBAL")
  .action(async (name, opts) => {
    const { api } = getCtx();
    await switchProxy(api, opts.group, name);
    ok(`已将 ${C.bold}${opts.group}${C.reset} 切换为 ${C.green}${name}${C.reset}`);
  });

proxy
  .command("group [name]")
  .description("查看代理组成员（默认显示所有代理组）")
  .action(async (name) => {
    const { api } = getCtx();
    const all = await listProxies(api);
    if (name) {
      const g = all[name];
      if (!g) { err(`找不到代理组: ${name}`); process.exit(1); }
      header(`${g.name} [${g.type}] → ${g.now ?? "无"}`);
      for (const n of g.all ?? []) {
        const mark = n === g.now ? ` ${C.green}← 当前${C.reset}` : "";
        console.log(`  ${C.gray}•${C.reset} ${n}${mark}`);
      }
    } else {
      const groups = await getProxyGroups(api);
      for (const g of groups) {
        console.log(`${C.bold}${g.name}${C.reset} → ${g.now ?? C.gray + "无" + C.reset}`);
      }
    }
  });

proxy
  .command("check [provider]")
  .description("触发健康检查（测速）")
  .action(async (provider) => {
    const { api } = getCtx();
    if (provider) {
      info(`正在对 ${provider} 测速...`);
      await healthcheck(api, provider);
      ok("测速请求已发送");
    } else {
      const providers = await listProviders(api);
      info(`正在对 ${providers.length} 个 provider 测速...`);
      for (const p of providers) {
        await healthcheck(api, p);
      }
      ok("全部测速请求已发送");
    }
  });

// ── rule ─────────────────────────────────────────────────────────────────────

const rule = program.command("rule").description("规则管理");

rule
  .command("list")
  .description("查看当前运行时规则")
  .option("-n, --limit <n>", "最多显示条数", "50")
  .action(async (opts) => {
    const { api } = getCtx();
    const rules = await listRules(api);
    header(`规则列表（共 ${rules.length} 条）`);
    const limit = parseInt(opts.limit, 10);
    for (const r of rules.slice(0, limit)) {
      console.log(
        `  ${C.cyan}${r.type.padEnd(12)}${C.reset}` +
        `${r.payload.padEnd(40)}` +
        `${C.yellow}${r.proxy}${C.reset}`
      );
    }
    if (rules.length > limit) {
      console.log(`  ${C.gray}... 还有 ${rules.length - limit} 条${C.reset}`);
    }
  });

rule
  .command("add <domain>")
  .description("添加直连规则到 mixin.yaml（自动重启）")
  .option("-p, --proxy <proxy>", "目标代理，默认 DIRECT", "DIRECT")
  .option("-c, --comment <comment>", "注释")
  .action((domain, opts) => {
    const { mixin } = getCtx();
    info(`添加规则: DOMAIN,${domain},${opts.proxy}`);
    addDirectRule(mixin, domain, opts.proxy, opts.comment);
    ok(`规则已添加，mihomo 已重启`);
  });

rule
  .command("del <payload>")
  .description("从 mixin.yaml 删除包含指定 payload 的规则（自动重启）")
  .action((payload) => {
    const { mixin } = getCtx();
    const removed = removeRule(mixin, payload);
    if (removed) {
      ok(`规则已删除，mihomo 已重启`);
    } else {
      err(`未找到包含 "${payload}" 的规则`);
    }
  });

// ── tun ──────────────────────────────────────────────────────────────────────

const tun = program.command("tun").description("TUN 模式管理");

tun
  .command("status")
  .description("查看 TUN 状态")
  .action(async () => {
    const { api } = getCtx();
    const enabled = await getTunStatus(api);
    console.log(`TUN 模式: ${enabled ? `${C.green}已开启${C.reset}` : `${C.red}已关闭${C.reset}`}`);
  });

tun
  .command("on")
  .description("开启 TUN 模式（写 mixin → 重启）")
  .action(() => {
    const { mixin } = getCtx();
    info("开启 TUN 模式...");
    setTun(mixin, true);
    ok("TUN 模式已开启，mihomo 已重启");
  });

tun
  .command("off")
  .description("关闭 TUN 模式（写 mixin → 重启）")
  .action(() => {
    const { mixin } = getCtx();
    info("关闭 TUN 模式...");
    setTun(mixin, false);
    ok("TUN 模式已关闭，mihomo 已重启");
  });

// ── dns ──────────────────────────────────────────────────────────────────────

const dns = program.command("dns").description("DNS 管理");

dns
  .command("query <hostname>")
  .description("通过 Clash DNS 解析域名")
  .option("-t, --type <type>", "记录类型（A/AAAA/CNAME/MX）", "A")
  .action(async (hostname, opts) => {
    const { api } = getCtx();
    const result = await dnsQuery(api, hostname, opts.type);
    header(`DNS 查询: ${hostname} (${opts.type})`);
    if (!result.Answer?.length) {
      console.log(`  ${C.gray}无结果${C.reset}`);
      return;
    }
    for (const a of result.Answer) {
      console.log(`  ${C.green}${a.data.padEnd(20)}${C.reset} TTL=${a.TTL}`);
    }
  });

const dnsFilter = dns.command("filter").description("fake-ip-filter 管理");

dnsFilter
  .command("list")
  .description("列出 fake-ip-filter 域名")
  .action(() => {
    const { mixin } = getCtx();
    const filter = getFakeIpFilter(mixin);
    header(`fake-ip-filter（${filter.length} 条）`);
    for (const d of filter) {
      console.log(`  ${C.cyan}•${C.reset} ${d}`);
    }
  });

dnsFilter
  .command("add <domain>")
  .description("添加域名到 fake-ip-filter（重启生效）")
  .action((domain) => {
    const { mixin } = getCtx();
    addFakeIpFilter(mixin, domain);
    ok(`${domain} 已加入 fake-ip-filter，mihomo 已重启`);
  });

dnsFilter
  .command("del <domain>")
  .description("从 fake-ip-filter 移除域名（重启生效）")
  .action((domain) => {
    const { mixin } = getCtx();
    const removed = removeFakeIpFilter(mixin, domain);
    if (removed) {
      ok(`${domain} 已从 fake-ip-filter 移除，mihomo 已重启`);
    } else {
      err(`fake-ip-filter 中未找到 "${domain}"`);
    }
  });

// ── connections ───────────────────────────────────────────────────────────────

program
  .command("connections")
  .description("查看/管理活跃连接")
  .option("--close-all", "关闭所有连接")
  .option("--close <id>", "关闭指定 ID 的连接")
  .option("-n, --limit <n>", "最多显示条数", "20")
  .action(async (opts) => {
    const { api } = getCtx();

    if (opts.closeAll) {
      await closeAllConnections(api);
      ok("所有连接已关闭");
      return;
    }

    if (opts.close) {
      await closeConnection(api, opts.close);
      ok(`连接 ${opts.close} 已关闭`);
      return;
    }

    const { connections, downloadTotal, uploadTotal } = await listConnections(api);
    header(`活跃连接（${connections.length} 条）`);
    console.log(
      `  ${C.gray}总流量: ↓${fmtBytes(downloadTotal)} ↑${fmtBytes(uploadTotal)}${C.reset}\n`
    );

    const limit = parseInt(opts.limit, 10);
    for (const c of connections.slice(0, limit)) {
      const host = c.metadata.host || c.metadata.destinationIP;
      console.log(
        `  ${C.cyan}${c.id.slice(0, 8)}${C.reset} ` +
        `${host.padEnd(35)} ` +
        `${C.yellow}${c.chains.join(" → ")}${C.reset}`
      );
    }
    if (connections.length > limit) {
      console.log(`  ${C.gray}... 还有 ${connections.length - limit} 条${C.reset}`);
    }
  });

// ── sub ───────────────────────────────────────────────────────────────────────

const sub = program.command("sub").description("订阅管理");

sub
  .command("update <url>")
  .description("更新订阅（下载 → 验证 → merge → 重启）")
  .action(async (url) => {
    const { cfg } = getCtx();
    info(`正在更新订阅: ${url}`);
    await updateSubscription(url, cfg);
    ok("订阅更新成功，mihomo 已重启");
  });

// ── mixin ─────────────────────────────────────────────────────────────────────

program
  .command("mixin")
  .description("查看 mixin.yaml 内容")
  .action(() => {
    const { mixin } = getCtx();
    const obj = mixin.read();
    const yaml = (obj as unknown as { toJSON?: () => unknown });
    console.log(JSON.stringify(yaml ?? obj, null, 2));
  });

// ── config ────────────────────────────────────────────────────────────────────

program
  .command("config")
  .description("显示当前运行时配置摘要")
  .action(async () => {
    const { cfg, api } = getCtx();
    header("运行时配置");
    console.log(`  controller : ${C.cyan}${cfg.controller}${C.reset}`);
    console.log(`  secret     : ${C.gray}${"*".repeat(cfg.secret.length)}${C.reset}`);
    console.log(`  service    : ${cfg.service}`);
    console.log(`  mixin      : ${cfg.mixinPath}`);
    console.log(`  runtime    : ${cfg.runtimePath}`);

    const ver = await api.get<{ version: string; meta?: boolean }>("/version");
    console.log(`  version    : ${C.green}${ver.version}${C.reset}${ver.meta ? " (meta)" : ""}`);
  });

// ── 错误处理 ──────────────────────────────────────────────────────────────────

program.parseAsync(process.argv).catch((e: Error) => {
  err(e.message);
  process.exit(1);
});
