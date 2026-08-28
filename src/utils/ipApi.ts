export type IpInfo = {
  query: string
  status: string
  country: string
  countryCode: string
  region: string
  regionName: string
  city: string
  zip: string
  lat: number
  lon: number
  timezone: string
  isp: string
  org: string
  as: string
}

const ENDPOINT = 'http://ip-api.com/json'

export async function lookupIp(ip: string): Promise<IpInfo> {
  const url = `${ENDPOINT}/${encodeURIComponent(ip)}?lang=zh-CN`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.status === 'fail') {
    throw new Error('查询失败: ' + (data.message || '无效的 IP 或 API 限速 (45 req/min)'))
  }
  return data as IpInfo
}

export async function lookupSelf(): Promise<IpInfo> {
  const url = `${ENDPOINT}?lang=zh-CN`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.status === 'fail') {
    throw new Error('查询失败: ' + (data.message || 'API 限速'))
  }
  return data as IpInfo
}
