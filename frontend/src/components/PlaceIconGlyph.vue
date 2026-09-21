<script setup lang="ts">
import { computed } from 'vue';
import { placeIconSvg, resolvePlaceIcon } from '../utils/place-icons';

const props = defineProps<{ type?: string; category?: string; size?: number }>();
const resolved = computed(() => resolvePlaceIcon(props.type, props.category));
</script>

<template>
  <svg :width="size || 16" :height="size || 16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" v-html="placeIconSvg[resolved]" />
</template>
