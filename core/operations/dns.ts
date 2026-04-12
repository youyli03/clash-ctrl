import type { ClashAPI } from "../api.ts";
import type { ClashMixin } from "../mixin.ts";
import type { DNSResult } from "../types.ts";

/**
 * 通过 Clash DNS API 解析域名
 * @param name  域名，如 "google.com"
 * @param type  记录类型，默认 "A"
 */
export async function dnsQuery(
  api: ClashAPI,
  name: string,
  type = "A"
): Promise<DNSResult> {
  return api.get<DNSResult>(`/dns/query?name=${encodeURIComponent(name)}&type=${type}`);
}

/** 获取当前 mixin 中的 fake-ip-filter 列表 */
export function getFakeIpFilter(mixin: ClashMixin): string[] {
  return mixin.getFakeIpFilter();
}

/**
 * 添加域名到 fake-ip-filter（不走 fake-ip，直接真实解析）
 * 修改 mixin → merge → restart
 */
export function addFakeIpFilter(mixin: ClashMixin, domain: string): void {
  mixin.addFakeIpFilter(domain);
  mixin.mergeAndRestart();
}

/**
 * 从 fake-ip-filter 移除域名
 * 修改 mixin → merge → restart
 * @returns 是否找到并移除了
 */
export function removeFakeIpFilter(mixin: ClashMixin, domain: string): boolean {
  const removed = mixin.removeFakeIpFilter(domain);
  if (removed) {
    mixin.mergeAndRestart();
  }
  return removed;
}
