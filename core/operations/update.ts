import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { ClashConfig } from "../types.ts";

/** 允许的 URL 协议白名单 */
const ALLOWED_PROTOCOLS = ["https:", "http:"];

/**
 * 更新订阅配置
 * 步骤：备份 config.yaml → 下载新配置 → mihomo -t 验证 → merge → restart
 *
 * @param url 订阅链接（必须是 http:// 或 https://，禁止 file:// 等本地协议）
 * @param cfg ClashConfig
 */
export async function updateSubscription(url: string, cfg: ClashConfig): Promise<void> {
  // 0. URL 安全校验：只允许 http/https，禁止 file:// 等本地协议
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`无效的订阅 URL: ${url}`);
  }
  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
    throw new Error(
      `不允许的 URL 协议: ${parsedUrl.protocol}，仅支持 http/https`
    );
  }

  const { configRawPath, runtimePath, mixinPath, yqBin, service, base } = cfg;
  const bakPath = `${configRawPath}.bak`;

  // 1. 备份（备份文件也属 root，用 sudo cp）
  spawnSync("sudo", ["cp", configRawPath, bakPath], { encoding: "utf-8" });

  // 2. 下载
  let newContent: string;
  {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`下载失败: ${res.status} ${res.statusText}`);
    }
    newContent = await res.text();
  }

  // 3. 写入 config.yaml（属 root，用 sudo tee）
  const writeResult = spawnSync("sudo", ["tee", configRawPath], {
    input: newContent,
    encoding: "utf-8",
  });
  if (writeResult.status !== 0) {
    throw new Error(`写入 config.yaml 失败: ${writeResult.stderr}`);
  }

  // 4. 验证（sudo mihomo -t）
  const binPath = path.join(base, "bin", "mihomo");
  const validateResult = spawnSync(
    "sudo",
    [binPath, "-d", base, "-f", configRawPath, "-t"],
    { encoding: "utf-8" }
  );

  if (validateResult.status !== 0) {
    // 回滚
    spawnSync("sudo", ["cp", bakPath, configRawPath], { encoding: "utf-8" });
    throw new Error(
      `配置验证失败，已回滚:\n${validateResult.stdout}\n${validateResult.stderr}`
    );
  }

  // 5. 保存订阅 URL（属 root，sudo tee）
  const urlFile = path.join(base, "url");
  spawnSync("sudo", ["tee", urlFile], { input: url, encoding: "utf-8" });

  // 6. Merge（yq eval-all → sudo tee runtime.yaml）
  const mergeResult = spawnSync(
    "sudo",
    [
      yqBin,
      "eval-all",
      ". as $item ireduce ({}; . *+ $item) | (.. | select(tag == \"!!seq\")) |= unique",
      mixinPath,
      configRawPath,
      mixinPath,
    ],
    { encoding: "utf-8" }
  );

  if (mergeResult.status !== 0) {
    spawnSync("sudo", ["cp", bakPath, configRawPath], { encoding: "utf-8" });
    throw new Error(`合并失败，已回滚: ${mergeResult.stderr}`);
  }

  const teeResult = spawnSync("sudo", ["tee", runtimePath], {
    input: mergeResult.stdout,
    encoding: "utf-8",
  });
  if (teeResult.status !== 0) {
    throw new Error(`写入 runtime.yaml 失败: ${teeResult.stderr}`);
  }

  // 7. Restart
  const restartResult = spawnSync("sudo", ["systemctl", "restart", service], {
    encoding: "utf-8",
  });
  if (restartResult.status !== 0) {
    throw new Error(`重启失败: ${restartResult.stderr}`);
  }
}
