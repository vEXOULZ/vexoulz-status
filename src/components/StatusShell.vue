<script setup lang="ts">
// Every page's frame: the shared shell. Nothing to sign in to, so no account menu.
import { VxSiteShell } from '@vexoulz/ui'
import type { NavItem } from '@vexoulz/ui'

const NAV: NavItem[] = [{ label: 'Services', to: '/' }]
</script>

<template>
  <VxSiteShell site="status" :nav="NAV">
    <slot></slot>
  </VxSiteShell>
</template>
