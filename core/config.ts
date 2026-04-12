import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { ClashConfig } from "./types.ts";

// ── 默认路径常量 ───────────────────────────────────────────────────────────────
const CLASH_BASE = process.env["CLASH_BASE"] ?? "/opt/clash";
const MIXIN_PATH = path.join(CLASH_BASE, "mixin.yaml");
const RUNTIME_PATH = path.join(CLASH_BASE, "runtime.yaml");
const CONFIG_RAW_PATH = path.join(CLASH_BASE, "config.yaml");
const YQ_BIN = path.join(CLASH_BASE, "bin", "yq");
const SERVICE_NAME = process.env["CLASH_SERVICE"] ?? "mihomo";

let _cached: ClashConfig | null = null;

/**
 * 读取运行时配置，提取 secret 和 external-controller 地址。
 * 结果会缓存，进程内只读一次文件。
 */
export function getConfig(forceReload = false): ClashConfig {
  if (_cached && !forceReload) return _cached;

  let secret = "clash";
  let controller = "http://127.0.0.1:9090";

  try {
    const raw = fs.readFileSync(RUNTIME_PATH, "utf-8");
    const parsed = yaml.load(raw) as Record<string, unknown>;

    if (typeof parsed?.["secret"] === "string") {
      secret = parsed["secret"];
    }
    if (typeof parsed?.["external-controller"] === "string") {
      let addr = parsed["external-controller"] as string;
      // 如果绑定 0.0.0.0，改为 127.0.0.1 供本地访问
      addr = addr.replace("0.0.0.0", "127.0.0.1");
      if (!addr.startsWith("http")) {
        addr = `http://${addr}`;
      }
      controller = addr;
    }
  } catch {
    // 文件不存在或解析失败，使用默认值
  }

  _cached = {
    base: CLASH_BASE,
    controller,
    secret,
    mixinPath: MIXIN_PATH,
    runtimePath: RUNTIME_PATH,
    configRawPath: CONFIG_RAW_PATH,
    yqBin: YQ_BIN,
    service: SERVICE_NAME,
  };

  return _cached;
}
