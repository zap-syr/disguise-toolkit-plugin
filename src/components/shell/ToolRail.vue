<script setup>
import { ref } from 'vue'
import { loadValue, saveValue } from '../../composables/useToolSettings.js'

defineProps({
  tools: { type: Array, required: true },
  activeId: { type: String, required: true },
})
defineEmits(['select'])

// Collapsed to icons by the operator; remembered between sessions.
const collapsed = ref(loadValue('rail-collapsed', '0') === '1')
function toggleCollapsed() {
  collapsed.value = !collapsed.value
  saveValue('rail-collapsed', collapsed.value ? '1' : '0')
}
</script>

<template>
  <nav class="tool-rail" :class="{ collapsed }" aria-label="Tools">
    <div class="tool-list">
      <button
        v-for="tool in tools"
        :key="tool.id"
        type="button"
        class="tool-item"
        :class="{ active: tool.id === activeId }"
        :aria-current="tool.id === activeId ? 'page' : undefined"
        :aria-label="tool.title"
        :title="`${tool.title}: ${tool.description}`"
        @click="$emit('select', tool.id)"
      >
        <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="tool.icon" />
        </svg>
        <span class="tool-label">{{ tool.title }}</span>
      </button>
    </div>

    <button
      type="button"
      class="tool-item rail-toggle"
      :aria-label="collapsed ? 'Expand the tool list' : 'Collapse the tool list'"
      :aria-expanded="!collapsed"
      :title="collapsed ? 'Expand the tool list' : 'Collapse the tool list'"
      @click="toggleCollapsed"
    >
      <svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 4v16 M18 7l-5 5 5 5" />
      </svg>
      <span class="tool-label">Collapse</span>
    </button>
  </nav>
</template>

<style scoped>
.tool-rail {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 168px;
  border-right: 1px solid #2a2a2a;
  background: #1a1a1a;
  transition: width 0.2s ease;
}
.tool-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  padding: 8px 0;
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
  transition: transform 0.2s ease;
}
.tool-item.active .tool-icon {
  stroke: #0a84ff;
}
.tool-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.rail-toggle {
  flex: none;
  height: 40px;
  border-top: 1px solid #222222;
  color: #aeaeae;
}
.rail-toggle:hover .tool-icon {
  stroke: #ffffff;
}

/* Icons only: collapsed by the operator, or always below 1100px (no room for labels there). */
.tool-rail.collapsed {
  width: 48px;
}
.tool-rail.collapsed .tool-label {
  display: none;
}
.tool-rail.collapsed .tool-item {
  justify-content: center;
  padding: 0;
}
.tool-rail.collapsed .rail-toggle .tool-icon {
  transform: scaleX(-1);
}

@media (max-width: 1100px) {
  .tool-rail {
    width: 48px;
  }
  .tool-label,
  .rail-toggle {
    display: none;
  }
  .tool-item {
    justify-content: center;
    padding: 0;
  }
}
</style>
