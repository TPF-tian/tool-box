<script setup lang="ts">
import { ref } from 'vue'
import JsonNode from './JsonNode.vue'
import type { JsonValue } from '@/utils/jsonValue'
import { isContainer, isArray, pathKey } from '@/utils/jsonValue'

const props = defineProps<{
  value: JsonValue
}>()

const emit = defineEmits<{
  (e: 'update:value', v: JsonValue): void
}>()

const collapsedPaths = ref<Set<string>>(new Set())

function toggleNode(path: (string | number)[]) {
  const k = pathKey(path)
  const next = new Set(collapsedPaths.value)
  if (next.has(k)) next.delete(k)
  else next.add(k)
  collapsedPaths.value = next
}

function deleteNode(path: (string | number)[]) {
  if (path.length === 0) return
  // 深克隆避免直接改 props.value
  const next = structuredClone(props.value) as JsonValue
  let target: any = next
  for (let i = 0; i < path.length - 1; i++) {
    target = target[path[i] as any]
    if (target === undefined || target === null) return
  }
  const last = path[path.length - 1]
  if (Array.isArray(target)) {
    target.splice(Number(last), 1)
  } else if (target && typeof target === 'object') {
    delete target[last as string]
  } else {
    return
  }
  // 顺手清理被删节点子树里残留的折叠状态
  const cleaned = new Set<string>()
  for (const p of collapsedPaths.value) {
    const pathArr = JSON.parse(p) as (string | number)[]
    let stillExists = true
    let probe: any = next
    for (const seg of pathArr) {
      if (probe === null || probe === undefined || typeof probe !== 'object') {
        stillExists = false
        break
      }
      probe = probe[seg as any]
    }
    if (stillExists) cleaned.add(p)
  }
  collapsedPaths.value = cleaned
  emit('update:value', next)
}

function expandAll() {
  collapsedPaths.value = new Set()
}

function collapseAll() {
  const all = new Set<string>()
  function walk(v: JsonValue, p: (string | number)[]) {
    if (isContainer(v)) {
      all.add(pathKey(p))
      const entries: [string | number, JsonValue][] = isArray(v)
        ? (v as JsonValue[]).map((x, i) => [i, x])
        : (Object.entries(v) as [string, JsonValue][])
      for (const [k, child] of entries) walk(child, [...p, k])
    }
  }
  walk(props.value, [])
  collapsedPaths.value = all
}
</script>

<template>
  <div>
    <div class="mb-2 flex items-center gap-1 text-xs">
      <button
        class="rounded px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        @click="expandAll"
      >
        全部展开
      </button>
      <button
        class="rounded px-2 py-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        @click="collapseAll"
      >
        全部折叠
      </button>
    </div>
    <div class="font-mono text-xs leading-5">
      <JsonNode
        :value="value"
        :path="[]"
        :depth="0"
        :collapsed-paths="collapsedPaths"
        @toggle="toggleNode"
        @delete="deleteNode"
      />
    </div>
  </div>
</template>
