<script setup lang="ts">
import { RouterLink } from 'vue-router'

withDefaults(
  defineProps<{
    to: string
    title: string
    desc: string
    icon?: 'image' | 'json' | 'ip' | 'doc'
    tag?: string
  }>(),
  { icon: undefined }
)
</script>

<template>
  <RouterLink
    :to="to"
    class="group relative block overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 transition-all hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
  >
    <div
      v-if="tag"
      class="absolute right-4 top-4 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 group-hover:bg-brand-100 group-hover:text-brand-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-brand-950 dark:group-hover:text-brand-300"
    >
      {{ tag }}
    </div>
    <div
      class="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 text-brand-600 dark:from-brand-950 dark:to-brand-900 dark:text-brand-400"
    >
      <slot name="icon">
        <svg v-if="icon === 'image'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
        <svg v-else-if="icon === 'json'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 3H6a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2" />
          <path d="M16 3h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-2" />
        </svg>
        <svg v-else-if="icon === 'doc'" xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8" />
          <path d="M8 17h6" />
        </svg>
        <svg v-else xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M2 12h20" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </slot>
    </div>
    <h3 class="mb-1 text-lg font-semibold text-slate-900 dark:text-white">{{ title }}</h3>
    <p class="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{{ desc }}</p>
    <div class="mt-4 flex items-center text-sm font-medium text-brand-600 dark:text-brand-400">
      打开
      <svg class="ml-1 transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    </div>
  </RouterLink>
</template>
