<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Layout from '@/components/Layout.vue'
import { lookupIp, lookupSelf, type IpInfo } from '@/utils/ipApi'

const query = ref('')
const loading = ref(false)
const error = ref('')
const info = ref<IpInfo | null>(null)

const selfInfo = ref<IpInfo | null>(null)
const selfLoading = ref(false)
const selfError = ref('')

const fieldDefs = (i: IpInfo) =>
  [
    ['IP', i.query],
    ['国家', i.country],
    ['国家代码', i.countryCode],
    ['地区', i.regionName],
    ['城市', i.city],
    ['邮编', i.zip],
    ['时区', i.timezone],
    ['ISP', i.isp],
    ['组织', i.org],
    ['ASN', i.as],
    ['经度', String(i.lon)],
    ['纬度', String(i.lat)]
  ] as [string, string][]

async function doLookup() {
  const ip = query.value.trim()
  if (!ip) {
    error.value = '请输入 IP 地址'
    return
  }
  if (!/^[\d.:a-fA-F]+$/.test(ip)) {
    error.value = 'IP 格式不正确 (支持 IPv4 / IPv6)'
    return
  }
  loading.value = true
  error.value = ''
  info.value = null
  try {
    info.value = await lookupIp(ip)
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function doSelfLookup() {
  selfLoading.value = true
  selfError.value = ''
  selfInfo.value = null
  try {
    selfInfo.value = await lookupSelf()
  } catch (e) {
    selfError.value = (e as Error).message
  } finally {
    selfLoading.value = false
  }
}

onMounted(() => {
  doSelfLookup()
})
</script>

<template>
  <Layout>
    <section class="mx-auto max-w-4xl px-4 py-10">
      <h1 class="mb-2 text-3xl font-bold text-slate-900 dark:text-white">IP 解析</h1>
      <p class="mb-6 text-slate-500 dark:text-slate-400">
        查询 IP 地理位置、ISP、ASN 等信息 (数据来源: ip-api.com, 免费 45 req/min)
      </p>

      <div class="card mb-6">
        <div class="flex gap-2">
          <input
            v-model="query"
            type="text"
            placeholder="输入 IP 地址, 如 8.8.8.8 或 2001:4860:4860::8888"
            class="input"
            @keyup.enter="doLookup"
          />
          <button class="btn-primary whitespace-nowrap" :disabled="loading" @click="doLookup">
            <span v-if="loading">查询中…</span>
            <span v-else>查询</span>
          </button>
        </div>
        <div
          v-if="error"
          class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
        >
          {{ error }}
        </div>
      </div>

      <div v-if="info" class="card mb-6 animate-fade-in">
        <h3 class="mb-4 font-semibold text-slate-900 dark:text-white">查询结果 · {{ info.query }}</h3>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="[label, value] in fieldDefs(info)"
            :key="label"
            class="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50"
          >
            <div class="text-xs text-slate-500 dark:text-slate-400">{{ label }}</div>
            <div class="mt-1 break-all text-sm font-medium text-slate-900 dark:text-white">{{ value || '—' }}</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="font-semibold text-slate-900 dark:text-white">本机 IP</h3>
          <button
            class="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            :disabled="selfLoading"
            @click="doSelfLookup"
          >
            刷新
          </button>
        </div>
        <div v-if="selfLoading" class="text-sm text-slate-500">检测中…</div>
        <div
          v-else-if="selfError"
          class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
        >
          {{ selfError }}
        </div>
        <div v-else-if="selfInfo" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 animate-fade-in">
          <div
            v-for="[label, value] in fieldDefs(selfInfo)"
            :key="label"
            class="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50"
          >
            <div class="text-xs text-slate-500 dark:text-slate-400">{{ label }}</div>
            <div class="mt-1 break-all text-sm font-medium text-slate-900 dark:text-white">{{ value || '—' }}</div>
          </div>
        </div>
        <div v-else class="text-sm text-slate-500">点击"刷新"查询本机 IP</div>
      </div>
    </section>
  </Layout>
</template>
