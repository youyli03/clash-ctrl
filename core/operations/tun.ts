import type { ClashAPI } from "../api.ts";
import type { ClashMixin } from "../mixin.ts";

/** 通过 API 获取当前 TUN 状态 */
export async function getTunStatus(api: ClashAPI): Promise<boolean> {
  const cfg = await api.get<{ tun?: { enable?: boolean } }>("/configs");
  return cfg.tun?.enable ?? false;
}

/**
 * 开关 TUN 模式（写 mixin → merge → restart）
 * @param enable true=开启 false=关闭
 */
export function setTun(mixin: ClashMixin, enable: boolean): void {
  mixin.setTun(enable);
  mixin.mergeAndRestart();
}
