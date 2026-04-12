import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { ClashConfig } from "../types.ts";

/**
 * 更新订阅配置
 * 步骤：备份 config.yaml → 下载新配置 → mihomo -t 验证 → merge → restart
 *
 * @param url 订阅链接（http/https），或 "file:///path/to/local.yaml"
 * @param cfg ClashConfig
 */
export async function updateSubscription(url: string, cfg: ClashConfig): Promise<void> {
  const { configRawPath, runtimePath, mixinPath, yqBin, service, base } = cfg;
  const bakPath = `${configRawPath}.bak`;

  // 1. 备份
  fs.copyFileSync(configRawPath, bakPath);

  // 2. 下载
  let newContent: string;
  if (url.startsWith("file://")) {
    const filePath = url.replace("file://", "");
    newContent = fs.readFileSync(filePath, "utf-8");
  } else {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`下载失败: ${res.status} ${res.statusText}`);
    }
    newContent = await res.text();
  }

  // 3. 写入
  fs.writeFileSync(configRawPath, newContent, "utf-8");

  // 4. 验证（mihomo -t）
  const binPath = path.join(base, "bin", "mihomo");
  const validateResult = spawnSync(
    binPath,
    ["-d", base, "-f", configRawPath, "-t"],
    { encoding: "utf-8" }
  );

  if (validateResult.status !== 0) {
    // 回滚
    fs.copyFileSync(bakPath, configRawPath);
    throw new Error(
      `配置验证失败，已回滚:\n${validateResult.stdout}\n${validateResult.stderr}`
    );
  }

  // 5. 保存订阅 URL
  const urlFile = path.join(base, "url");
  fs.writeFileSync(urlFile, url, "utf-8");

  // 6. Merge + Restart
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
    fs.copyFileSync(bakPath, configRawPath);
    throw new Error(`合并失败，已回滚: ${mergeResult.stderr}`);
  }

  fs.writeFileSync(runtimePath, mergeResult.stdout, "utf-8");

  const restartResult = spawnSync("sudo", ["systemctl", "restart", service], {
    encoding: "utf-8",
  });

  if (restartResult.status !== 0) {
    throw new Error(`重启失败: ${restartResult.stderr}`);
  }
}
