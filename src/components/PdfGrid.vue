<script setup lang="ts">
/**
 * PDF 页面缩略图网格(供"提取页"和"删除页"共用)
 */
defineProps<{
  pages: { index: number; width: number; height: number }[]
  selected: Set<number>
  /** canvas 元素数组(由父组件填充) */
  canvasRefs: (HTMLCanvasElement | null)[]
}>()

const emit = defineEmits<{
  toggle: [n: number]
}>()

function setRef(el: any, idx: number, canvasRefs: (HTMLCanvasElement | null)[]) {
  canvasRefs[idx] = (el as HTMLCanvasElement) ?? null
}
</script>

<template>
  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
    <div
      v-for="(p, i) in pages"
      :key="p.index"
      class="group cursor-pointer overflow-hidden rounded-lg border-2 bg-white transition-all dark:bg-slate-800"
      :class="selected.has(p.index) ? 'border-brand-500 shadow-md' : 'border-slate-200 hover:border-brand-300 dark:border-slate-700'"
      @click="emit('toggle', p.index)"
    >
      <div
        class="flex items-center justify-center bg-slate-50 p-2 dark:bg-slate-900"
        :style="{ aspectRatio: `${p.width} / ${p.height}`, maxHeight: '220px' }"
      >
        <canvas
          :ref="(el) => setRef(el, i, canvasRefs)"
          class="max-h-52 w-full object-contain"
        />
      </div>
      <div class="flex items-center justify-between px-2 py-1.5 text-xs">
        <span class="font-mono text-slate-600 dark:text-slate-300">第 {{ p.index }} 页</span>
        <span
          class="rounded px-1.5 py-0.5"
          :class="selected.has(p.index) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'"
        >
          {{ selected.has(p.index) ? '✓ 已选' : '点击选择' }}
        </span>
      </div>
    </div>
  </div>
</template>
