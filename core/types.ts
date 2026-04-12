// ── 类型定义 ──────────────────────────────────────────────────────────────────

export interface ClashConfig {
  base: string;          // /opt/clash
  controller: string;   // http://127.0.0.1:9090
  secret: string;        // Bearer token
  mixinPath: string;     // /opt/clash/mixin.yaml
  runtimePath: string;   // /opt/clash/runtime.yaml
  configRawPath: string; // /opt/clash/config.yaml
  yqBin: string;         // /opt/clash/bin/yq
  service: string;       // mihomo
}

export interface Proxy {
  name: string;
  type: string;
  now?: string;       // 当前选中节点（Selector/URLTest）
  all?: string[];     // 组内所有节点
  udp?: boolean;
  history?: ProxyHistory[];
  alive?: boolean;
}

export interface ProxyHistory {
  time: string;
  delay: number;
}

export interface Rule {
  type: string;
  payload: string;
  proxy: string;
  size?: number;
}

export interface Connection {
  id: string;
  metadata: {
    network: string;
    type: string;
    sourceIP: string;
    destinationIP: string;
    destinationPort: string;
    host: string;
    dnsMode: string;
    processPath?: string;
  };
  upload: number;
  download: number;
  start: string;
  chains: string[];
  rule: string;
  rulePayload: string;
}

export interface DNSAnswer {
  TTL: number;
  data: string;
  name: string;
  type: number;
}

export interface DNSResult {
  AD: boolean;
  Answer?: DNSAnswer[];
  Question: { name: string; type: number }[];
}

export interface ConnectionsResult {
  downloadTotal: number;
  uploadTotal: number;
  connections: Connection[];
}

export interface ProxiesResult {
  proxies: Record<string, Proxy>;
}

export interface RulesResult {
  rules: Rule[];
}

export class ClashAPIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ClashAPIError";
  }
}
