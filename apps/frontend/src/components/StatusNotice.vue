<script setup lang="ts">
/**
 * The rose error/notice box shared by full-screen load errors and the
 * ADR-0030 non-blocking "could not refresh" notice shown over cached data.
 */
defineProps<{ message: string; live?: boolean }>();
</script>

<template>
  <p
    :role="live ? 'status' : undefined"
    class="rounded-md border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
  >
    {{ message }}
  </p>
</template>
