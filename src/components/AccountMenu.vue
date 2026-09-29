<script setup lang="ts">
// The header's account control, wired to the shared sign-in (src/lib/account.ts).
import { VxAccountMenu } from '@vexoulz/ui'
import { useAccount } from '@vexoulz/ui/account'

const account = useAccount()
</script>

<template>
  <VxAccountMenu
    :user="account.menuUser.value"
    :disabled="!account.enabled"
    @sign-in="account.signIn()"
    @sign-out="account.signOut({ everywhere: true })"
  ><slot></slot></VxAccountMenu>
</template>
