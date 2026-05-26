/**
 * Zero config.json type definitions.
 *
 * Based on the Zero README & examples/v0.0.2 structure.
 * When the kernel adds or changes fields, only this file needs updating.
 *
 * Convention: every outbound/inbound has a globally-unique `tag` string.
 */

// ─── Inbounds ───────────────────────────────────────────

export type ZeroInbound =
  | ZeroMixedInbound
  | ZeroSocksInbound
  | ZeroHttpInbound

export interface ZeroMixedInbound {
  type: 'mixed'
  tag: string
  listen: string
  listen_port: number
  sni?: string
}

export interface ZeroSocksInbound {
  type: 'socks'
  tag: string
  listen: string
  listen_port: number
}

export interface ZeroHttpInbound {
  type: 'http'
  tag: string
  listen: string
  listen_port: number
}

// ─── Outbounds (protocol) ───────────────────────────────

export type ZeroOutbound =
  | ZeroVlessOutbound
  | ZeroVmessOutbound
  | ZeroTrojanOutbound
  | ZeroShadowsocksOutbound
  | ZeroHysteria2Outbound
  | ZeroTuicOutbound
  | ZeroSocksOutbound
  | ZeroHttpOutbound
  | ZeroDirectOutbound
  | ZeroBlockOutbound
  | ZeroSelectorOutbound
  | ZeroUrltestOutbound
  | ZeroFallbackOutbound
  | ZeroChainedOutbound

export interface ZeroVlessOutbound {
  type: 'vless'
  tag: string
  server: string
  server_port: number
  uuid: string
  flow?: string
  tls?: ZeroTlsConfig
  transport?: ZeroTransportConfig
}

export interface ZeroVmessOutbound {
  type: 'vmess'
  tag: string
  server: string
  server_port: number
  uuid: string
  security?: string
  alter_id?: number
  tls?: ZeroTlsConfig
  transport?: ZeroTransportConfig
}

export interface ZeroTrojanOutbound {
  type: 'trojan'
  tag: string
  server: string
  server_port: number
  password: string
  tls?: ZeroTlsConfig
  transport?: ZeroTransportConfig
}

export interface ZeroShadowsocksOutbound {
  type: 'shadowsocks'
  tag: string
  server: string
  server_port: number
  method: string
  password: string
}

export interface ZeroHysteria2Outbound {
  type: 'hysteria2'
  tag: string
  server: string
  server_port: number
  password: string
  tls?: ZeroTlsConfig
}

export interface ZeroTuicOutbound {
  type: 'tuic'
  tag: string
  server: string
  server_port: number
  uuid: string
  password: string
  tls?: ZeroTlsConfig
}

export interface ZeroSocksOutbound {
  type: 'socks'
  tag: string
  server: string
  server_port: number
  username?: string
  password?: string
}

export interface ZeroHttpOutbound {
  type: 'http'
  tag: string
  server: string
  server_port: number
  username?: string
  password?: string
}

export interface ZeroDirectOutbound {
  type: 'direct'
  tag: string
}

export interface ZeroBlockOutbound {
  type: 'block'
  tag: string
}

// ─── Outbounds (group) ──────────────────────────────────

export interface ZeroSelectorOutbound {
  type: 'selector'
  tag: string
  outbounds: string[]
  default?: string
}

export interface ZeroUrltestOutbound {
  type: 'urltest'
  tag: string
  outbounds: string[]
  url?: string
  interval?: string
}

export interface ZeroFallbackOutbound {
  type: 'fallback'
  tag: string
  outbounds: string[]
}

export interface ZeroChainedOutbound {
  type: 'chained'
  tag: string
  outbounds: string[]
}

// ─── Shared sub-types ───────────────────────────────────

export interface ZeroTlsConfig {
  enabled: boolean
  server_name?: string
  insecure?: boolean
  alpn?: string[]
  reality?: {
    enabled: boolean
    public_key?: string
    short_id?: string
  }
}

export interface ZeroTransportConfig {
  type: 'ws' | 'grpc' | 'h2' | 'httpupgrade'
  path?: string
  headers?: Record<string, string>
  service_name?: string
}

// ─── Route ──────────────────────────────────────────────

export interface ZeroRouteRule {
  inbound?: string[]
  outbound: string
}

// ─── Top-level config ───────────────────────────────────

export interface ZeroConfig {
  log?: { level: string }
  api?: {
    control: {
      enabled: boolean
      listen: { address: string; port: number }
    }
  }
  inbounds: ZeroInbound[]
  outbounds: ZeroOutbound[]
  route: {
    rules: ZeroRouteRule[]
    final?: string
  }
}
