// ipwho.is: 免费, 无频率限制, 支持 HTTPS
// 字段命名是 snake_case, 适配成项目里用的小驼峰
// 参考: https://ipwho.is (返回 success 字段判断是否成功)

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

const ENDPOINT = 'https://ipwho.is'

/**
 * 把 ipwho.is 的响应 (snake_case + 嵌套 connection) 适配成 IpInfo
 */
function adapt(data: any): IpInfo {
  return {
    query: data.ip ?? '',
    status: data.success ? 'success' : 'fail',
    country: data.country ?? '',
    countryCode: data.country_code ?? '',
    region: data.region_code ?? '',
    regionName: data.region ?? '',
    city: data.city ?? '',
    zip: data.postal ?? '',
    lat: typeof data.latitude === 'number' ? data.latitude : 0,
    lon: typeof data.longitude === 'number' ? data.longitude : 0,
    timezone: data.timezone?.id ?? data.timezone ?? '',
    isp: data.connection?.isp ?? '',
    org: data.connection?.org ?? '',
    as: data.connection
      ? `${data.connection.asn ?? ''} ${data.connection.org ?? ''}`.trim()
      : ''
  }
}

export async function lookupIp(ip: string): Promise<IpInfo> {
  const url = `${ENDPOINT}/${encodeURIComponent(ip)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.success === false) {
    throw new Error('查询失败: ' + (data.message || '无效的 IP'))
  }
  return adapt(data)
}

export async function lookupSelf(): Promise<IpInfo> {
  const url = ENDPOINT
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data.success === false) {
    throw new Error('查询失败: ' + (data.message || 'API 错误'))
  }
  return adapt(data)
}
