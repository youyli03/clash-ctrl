import type { ClashAPI } from "../api.ts";
import type { Proxy, ProxiesResult } from "../types.ts";

/** 获取所有代理（含节点和代理组） */
export async function listProxies(api: ClashAPI): Promise<Record<string, Proxy>> {
  const result = await api.get<ProxiesResult>("/proxies");
  return result.proxies;
}

/** 获取代理组（Selector / URLTest / Fallback / LoadBalance） */
export async function getProxyGroups(api: ClashAPI): Promise<Proxy[]> {
  const proxies = await listProxies(api);
  const groupTypes = ["Selector", "URLTest", "Fallback", "LoadBalance"];
  return Object.values(proxies).filter((p) => groupTypes.includes(p.type));
}

/** 获取所有真实节点（非 DIRECT/REJECT/内置组） */
export async function getRealProxies(api: ClashAPI): Promise<Proxy[]> {
  const proxies = await listProxies(api);
  const skip = ["Direct", "Reject", "RejectDrop", "Compatible", "Pass",
                 "Selector", "URLTest", "Fallback", "LoadBalance"];
  return Object.values(proxies).filter((p) => !skip.includes(p.type));
}

/**
 * 切换代理组的当前节点
 * @param groupName 代理组名称（如 "GLOBAL" 或 "一分机场"）
 * @param proxyName 目标节点名称
 */
export async function switchProxy(
  api: ClashAPI,
  groupName: string,
  proxyName: string
): Promise<void> {
  await api.put(`/proxies/${encodeURIComponent(groupName)}`, { name: proxyName });
}

/**
 * 对某个 provider 触发健康检查
 * @param providerName providers 列表中的名称
 */
export async function healthcheck(api: ClashAPI, providerName: string): Promise<void> {
  await api.get(`/providers/proxies/${encodeURIComponent(providerName)}/healthcheck`);
}

/** 获取所有 provider 名称 */
export async function listProviders(api: ClashAPI): Promise<string[]> {
  const result = await api.get<{ providers: Record<string, unknown> }>("/providers/proxies");
  return Object.keys(result.providers);
}
