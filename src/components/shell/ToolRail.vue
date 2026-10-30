<script setup>
defineProps({
  tools: { type: Array, required: true },
  activeId: { type: String, required: true },
})
defineEmits(['select'])
</script>

<template>
  <nav class="tool-rail" aria-label="Tools">
    <button
      v-for="tool in tools"
      :key="tool.id"
      type="button"
      class="tool-item"
      :class="{ active: tool.id === activeId }"
      :aria-current="tool.id === activeId ? 'page' : undefined"
      :title="tool.description"
      @click="$emit('select', tool.id)"
    >
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path :d="tool.icon" />
      </svg>
      <span class="tool-label">{{ tool.title }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tool-rail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 168px;
  padding: 8px 0;
  border-right: 1px solid #2a2a2a;
  background: #1a1a1a;
  overflow-y: auto;
}
.tool-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  color: #d4d4d4;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tool-item:hover {
  background: #1f1f1f;
  color: #f2f2f2;
}
.tool-item:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 2px #0a84ff;
}
.tool-item.active {
  border-left-color: #0a84ff;
  background: rgba(10, 132, 255, 0.1);
  color: #ffffff;
  font-weight: 600;
}
.tool-icon {
  flex: none;
  width: 18px;
  height: 18px;
  fill: none;
  stroke: #9c9c9c;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tool-item.active .tool-icon {
  stroke: #0a84ff;
}
.tool-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Icons only below 1100px, so the default 960px window keeps room for the tool. */
@media (max-width: 1100px) {
  .tool-rail {
    width: 48px;
  }
  .tool-label {
    display: none;
  }
  .tool-item {
    justify-content: center;
    padding: 0;
  }
}
</style>
