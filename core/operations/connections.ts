import type { ClashAPI } from "../api.ts";
import type { Connection, ConnectionsResult } from "../types.ts";

/** 获取所有活跃连接 */
export async function listConnections(api: ClashAPI): Promise<{
  connections: Connection[];
  downloadTotal: number;
  uploadTotal: number;
}> {
  const result = await api.get<ConnectionsResult>("/connections");
  return result;
}

/**
 * 关闭单个连接
 * @param id  连接 ID
 */
export async function closeConnection(api: ClashAPI, id: string): Promise<void> {
  await api.delete(`/connections/${encodeURIComponent(id)}`);
}

/** 关闭所有连接 */
export async function closeAllConnections(api: ClashAPI): Promise<void> {
  await api.delete("/connections");
}
