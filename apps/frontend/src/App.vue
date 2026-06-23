<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import AppTopbar from '@/components/AppTopbar.vue';

const route = useRoute();

const showTopbar = computed(() => Boolean(route.meta.requiresAuth));
</script>

<template>
  <div :class="showTopbar ? 'h-screen overflow-hidden flex flex-col' : 'min-h-screen'">
    <div :class="showTopbar ? 'flex-1 overflow-y-auto relative' : ''">
      <AppTopbar v-if="showTopbar" class="sticky top-0 z-20" />
      <router-view />
    </div>
  </div>
</template>
