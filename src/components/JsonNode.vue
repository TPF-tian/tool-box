<script setup lang="ts">
import { computed } from 'vue'
import type { JsonValue } from '@/utils/jsonValue'
import { isContainer, isArray, pathKey } from '@/utils/jsonValue'

defineOptions({ name: 'JsonNode' })

const props = defineProps<{
  value: JsonValue
  keyName?: string | number
  /** 是否显示 key (object 子节点=true, array 子节点=false, 根节点=false) */
  showKey?: boolean
  /** 当前节点在树中的路径,根节点为 [] */
  path: (string | number)[]
  depth: number
  /** 被折叠的路径集合 (key = pathKey(path)) */
  collapsedPaths: Set<string>
}>()

const emit = defineEmits<{
  (e: 'toggle', path: (string | number)[]): void
  (e: 'delete', path: (string | number)[]): void
}>()

const container = computed(() => isContainer(props.value))
const array = computed(() => isArray(props.value))

const entries = computed<[string | number, JsonValue][]>(() => {
  if (array.value) {
    return (props.value as JsonValue[]).map((v, i) => [i as number, v])
  }
  if (container.value) {
    return Object.entries(props.value as { [k: string]: JsonValue }) as [string, JsonValue][]
  }
  return []
})

const childCount = computed(() => entries.value.length)
const isCollapsed = computed(() => props.collapsedPaths.has(pathKey(props.path)))

function toggle() {
  emit('toggle', props.path)
}

function onDelete() {
  emit('delete', props.path)
}

function displayPrimitive(v: JsonValue): string {
  if (typeof v === 'string') return `"${v}"`
  return String(v)
}

function valueClass(v: JsonValue): string {
  if (v === null) return 'text-slate-400 italic'
  if (typeof v === 'string') return 'text-emerald-700 dark:text-emerald-400'
  if (typeof v === 'number') return 'text-amber-700 dark:text-amber-400'
  if (typeof v === 'boolean') return 'text-violet-700 dark:text-violet-400'
  return ''
}

function indentPx(d: number) {
  return d * 16
}
</script>

<template>
  <div>
    <!-- 当前节点行 -->
    <div
      class="group flex items-center gap-1 py-0.5 leading-5"
      :style="{ paddingLeft: indentPx(depth) + 'px' }"
    >
      <!-- 折叠箭头 / 占位 -->
      <button
        v-if="container"
        @click="toggle"
        class="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 transition-transform transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        :class="{ '-rotate-90': isCollapsed }"
        :aria-label="isCollapsed ? '展开' : '折叠'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <span v-else class="inline-block h-4 w-4 shrink-0"></span>

      <!-- key (object 子节点) -->
      <span v-if="showKey && keyName !== undefined" class="shrink-0">
        <span class="text-slate-500">"</span><span class="text-sky-700 dark:text-sky-400">{{ keyName }}</span><span class="text-slate-500">":</span>
      </span>

      <!-- 值 / 容器开括号 -->
      <span v-if="!container" :class="valueClass(value)" class="break-all">{{ displayPrimitive(value) }}</span>
      <span v-else-if="isCollapsed" class="text-slate-500">
        <span>{{ array ? '[' : '{' }}</span>
        <span class="ml-1 italic text-slate-400">{{ childCount }} {{ array ? 'items' : 'keys' }}</span>
        <span>{{ array ? ']' : '}' }}</span>
      </span>
      <span v-else class="text-slate-500">{{ array ? '[' : '{' }}</span>

      <!-- 删除按钮 (根节点不显示) -->
      <button
        v-if="depth > 0"
        @click="onDelete"
        class="ml-auto inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-slate-400 opacity-0 transition-opacity hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100 dark:hover:bg-rose-950 dark:hover:text-rose-400"
        title="删除该节点"
        aria-label="删除"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>

    <!-- 子节点 -->
    <template v-if="container && !isCollapsed">
      <JsonNode
        v-for="entry in entries"
        :key="String(entry[0])"
        :value="entry[1]"
        :key-name="entry[0]"
        :show-key="!array"
        :path="[...path, entry[0]]"
        :depth="depth + 1"
        :collapsed-paths="collapsedPaths"
        @toggle="(p) => emit('toggle', p)"
        @delete="(p) => emit('delete', p)"
      />
      <div
        class="py-0.5 text-slate-500"
        :style="{ paddingLeft: indentPx(depth) + 'px' }"
      >{{ array ? ']' : '}' }}</div>
    </template>
  </div>
</template>
