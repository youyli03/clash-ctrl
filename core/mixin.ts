import * as fs from "node:fs";
import { spawnSync } from "node:child_process";
import yaml from "js-yaml";
import type { ClashConfig } from "./types.ts";

// ── ClashMixin ────────────────────────────────────────────────────────────────

export class ClashMixin {
  private mixinPath: string;
  private runtimePath: string;
  private configRawPath: string;
  private yqBin: string;
  private service: string;

  constructor(cfg: ClashConfig) {
    this.mixinPath = cfg.mixinPath;
    this.runtimePath = cfg.runtimePath;
    this.configRawPath = cfg.configRawPath;
    this.yqBin = cfg.yqBin;
    this.service = cfg.service;
  }

  /** 读取 mixin.yaml，返回解析后的对象 */
  read(): Record<string, unknown> {
    const raw = fs.readFileSync(this.mixinPath, "utf-8");
    return (yaml.load(raw) as Record<string, unknown>) ?? {};
  }

  /** 写回 mixin.yaml */
  write(obj: Record<string, unknown>): void {
    const content = yaml.dump(obj, { lineWidth: -1, noRefs: true });
    fs.writeFileSync(this.mixinPath, content, "utf-8");
  }

  /** 在 rules 数组头部追加一条规则（如 "DOMAIN,example.com,DIRECT"） */
  addRule(rule: string, comment?: string): void {
    const obj = this.read();
    const rules: string[] = (obj["rules"] as string[] | undefined) ?? [];
    // 避免重复
    if (!rules.includes(rule)) {
      const entry = comment ? `${rule} # ${comment}` : rule;
      rules.unshift(entry);
      obj["rules"] = rules;
      this.write(obj);
    }
  }

  /** 删除 rules 中包含指定 payload 的规则 */
  removeRule(payload: string): boolean {
    const obj = this.read();
    const rules: string[] = (obj["rules"] as string[] | undefined) ?? [];
    const before = rules.length;
    obj["rules"] = rules.filter((r) => !r.includes(payload));
    this.write(obj);
    return (obj["rules"] as string[]).length < before;
  }

  /** 设置 tun.enable */
  setTun(enable: boolean): void {
    const obj = this.read();
    const tun = (obj["tun"] as Record<string, unknown>) ?? {};
    tun["enable"] = enable;
    obj["tun"] = tun;
    this.write(obj);
  }

  /** 读取 dns.fake-ip-filter 列表 */
  getFakeIpFilter(): string[] {
    const obj = this.read();
    const dns = (obj["dns"] as Record<string, unknown>) ?? {};
    return (dns["fake-ip-filter"] as string[] | undefined) ?? [];
  }

  /** 添加 fake-ip-filter 域名 */
  addFakeIpFilter(domain: string): void {
    const obj = this.read();
    const dns = (obj["dns"] as Record<string, unknown>) ?? {};
    const filter: string[] = (dns["fake-ip-filter"] as string[] | undefined) ?? [];
    if (!filter.includes(domain)) {
      filter.push(domain);
      dns["fake-ip-filter"] = filter;
      obj["dns"] = dns;
      this.write(obj);
    }
  }

  /** 删除 fake-ip-filter 域名 */
  removeFakeIpFilter(domain: string): boolean {
    const obj = this.read();
    const dns = (obj["dns"] as Record<string, unknown>) ?? {};
    const filter: string[] = (dns["fake-ip-filter"] as string[] | undefined) ?? [];
    const before = filter.length;
    dns["fake-ip-filter"] = filter.filter((d) => d !== domain);
    obj["dns"] = dns;
    this.write(obj);
    return (dns["fake-ip-filter"] as string[]).length < before;
  }

  /**
   * 将 mixin.yaml + config.yaml 合并到 runtime.yaml
   * 等价于原脚本的 _merge_config_restart 的合并步骤
   */
  merge(): void {
    const result = spawnSync(
      "sudo",
      [
        this.yqBin,
        "eval-all",
        ". as $item ireduce ({}; . *+ $item) | (.. | select(tag == \"!!seq\")) |= unique",
        this.mixinPath,
        this.configRawPath,
        this.mixinPath,
      ],
      { encoding: "utf-8" }
    );

    if (result.status !== 0) {
      throw new Error(`yq merge 失败: ${result.stderr}`);
    }

    fs.writeFileSync(this.runtimePath, result.stdout, "utf-8");
  }

  /** 重启 mihomo 服务 */
  restart(): void {
    const result = spawnSync("sudo", ["systemctl", "restart", this.service], {
      encoding: "utf-8",
    });
    if (result.status !== 0) {
      throw new Error(`systemctl restart 失败: ${result.stderr}`);
    }
  }

  /** 合并配置并重启（大多数 mixin 修改后调用此方法） */
  mergeAndRestart(): void {
    this.merge();
    this.restart();
  }
}
