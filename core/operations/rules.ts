import type { ClashAPI } from "../api.ts";
import type { ClashMixin } from "../mixin.ts";
import type { Rule, RulesResult } from "../types.ts";

/** 获取当前运行时规则列表 */
export async function listRules(api: ClashAPI): Promise<Rule[]> {
  const result = await api.get<RulesResult>("/rules");
  return result.rules;
}

/**
 * 添加直连规则到 mixin.yaml（并 merge + restart）
 * @param domain 域名，自动生成 "DOMAIN,<domain>,DIRECT"
 * @param proxy  目标代理，默认 DIRECT
 * @param comment 可选注释
 */
export function addDirectRule(
  mixin: ClashMixin,
  domain: string,
  proxy = "DIRECT",
  comment?: string
): void {
  const rule = `DOMAIN,${domain},${proxy}`;
  mixin.addRule(rule, comment);
  mixin.mergeAndRestart();
}

/**
 * 删除 mixin.yaml 中包含指定 payload 的规则（并 merge + restart）
 * @returns 是否找到并删除了规则
 */
export function removeRule(mixin: ClashMixin, payload: string): boolean {
  const removed = mixin.removeRule(payload);
  if (removed) {
    mixin.mergeAndRestart();
  }
  return removed;
}
