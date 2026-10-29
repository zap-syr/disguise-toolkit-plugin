<script setup>
defineProps({
  modelValue: { type: [String, Number], required: true },
  // [{ value, label, title?, disabled? }]
  options: { type: Array, required: true },
  disabled: { type: Boolean, default: false },
  // >0 lays the options out as a grid with this many columns instead of one row
  columns: { type: Number, default: 0 },
})
defineEmits(['update:modelValue'])
</script>

<template>
  <div
    class="segmented"
    role="radiogroup"
    :class="{ disabled, grid: columns > 0 }"
    :style="columns > 0 ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : null"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      class="segmented-item"
      :class="{ active: option.value === modelValue }"
      :aria-checked="option.value === modelValue"
      :title="option.title"
      :disabled="disabled || option.disabled"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped>
.segmented {
  display: flex;
  background: #181818;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}
.segmented.grid {
  display: grid;
}
.segmented.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.segmented-item {
  flex: 1;
  min-width: 0;
  background: transparent;
  color: #9c9c9c;
  border: none;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: all 0.2s ease;
}
.segmented-item:hover:not(:disabled) {
  color: #f2f2f2;
}
.segmented-item:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
}
.segmented-item.active {
  background: #3a3a3a;
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.segmented-item:disabled {
  color: #777777;
  cursor: not-allowed;
}
.segmented-item.active:disabled {
  color: #9c9c9c;
}
</style>
