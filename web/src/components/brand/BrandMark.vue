<script setup lang="ts">
import { useId } from "vue";

const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
const backgroundGradientId = `${id}-edge-muse-bg`;
const markGradientId = `${id}-edge-muse-mark`;
</script>

<template>
  <svg
    aria-hidden="true"
    class="block shrink-0"
    focusable="false"
    viewBox="0 0 64 64"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient :id="backgroundGradientId" x1="10" x2="56" y1="8" y2="58">
        <stop stop-color="#25232b" />
        <stop offset="1" stop-color="#111217" />
      </linearGradient>
      <linearGradient :id="markGradientId" x1="18" x2="48" y1="20" y2="46">
        <stop stop-color="#f5b942" />
        <stop offset="0.54" stop-color="#d65cff" />
        <stop offset="1" stop-color="#3dd6c6" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="16" :fill="`url(#${backgroundGradientId})`" />
    <path
      d="M18 29V20a2 2 0 0 1 2-2h10"
      fill="none"
      stroke="#fff9ed"
      stroke-linecap="round"
      stroke-width="4"
    />
    <path
      d="M46 35v9a2 2 0 0 1-2 2H34"
      fill="none"
      stroke="#fff9ed"
      stroke-linecap="round"
      stroke-width="4"
    />
    <path
      d="M20 44V23h6.8L32 32.2 37.2 23H44v21h-6.3V33.8l-4.3 7.3h-2.8l-4.3-7.3V44H20Z"
      :fill="`url(#${markGradientId})`"
    />
    <path
      d="M48 15.5 49.8 20l4.7 1.9-4.7 1.9L48 28.5l-1.8-4.7-4.7-1.9 4.7-1.9L48 15.5Z"
      fill="#fff9ed"
    />
  </svg>
</template>
