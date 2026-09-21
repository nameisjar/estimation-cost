<script setup lang="ts">
import type { Selection } from "../types";

withDefaults(defineProps<{
  target: Selection;
  size?: number;
}>(), {
  size: 18,
});
</script>

<template>
  <svg
    class="location-marker-glyph"
    :class="`is-${target}`"
    viewBox="0 0 24 28"
    :width="size"
    :height="Math.round(size * 7 / 6)"
    aria-hidden="true"
  >
    <circle v-if="target === 'pickup'" class="location-marker-glyph-shape" cx="12" cy="13" r="9" vector-effect="non-scaling-stroke" />
    <path
      v-else
      class="location-marker-glyph-shape"
      d="M12 1.5C6.2 1.5 2 5.8 2 11.2c0 6.5 6.2 11.3 10 14.6 3.8-3.3 10-8.1 10-14.6C22 5.8 17.8 1.5 12 1.5Z"
      vector-effect="non-scaling-stroke"
    />
    <circle class="location-marker-glyph-core" cx="12" :cy="target === 'pickup' ? 13 : 11" r="3.8" />
    <circle class="location-marker-glyph-center" cx="12" :cy="target === 'pickup' ? 13 : 11" r="1.65" />
  </svg>
</template>
