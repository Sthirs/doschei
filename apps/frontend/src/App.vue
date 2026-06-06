<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import AppTopbar from '@/components/AppTopbar.vue';

const route = useRoute();

const showTopbar = computed(() => Boolean(route.meta.requiresAuth));
</script>

<template>
  <div class="min-h-screen">
    <AppTopbar v-if="showTopbar" />
    <router-view />
  </div>
</template>
