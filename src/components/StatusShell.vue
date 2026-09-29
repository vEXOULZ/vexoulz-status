<script setup lang="ts">
// Every page's frame: the shared shell. Nothing here needs signing in; the menu shows the shared account.
import { VxSiteShell } from '@vexoulz/ui'
import type { NavItem } from '@vexoulz/ui'
import AccountMenu from './AccountMenu.vue'

const NAV: NavItem[] = [{ label: 'Services', to: '/' }]
</script>

<template>
  <VxSiteShell site="status" :nav="NAV">
    <template #account><AccountMenu /></template>
    <slot></slot>
  </VxSiteShell>
</template>
