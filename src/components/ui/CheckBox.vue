<script setup>
// House checkbox: 16px box, blue when checked, dash when partial. Emits the click event so the
// parent can read modifier keys (Shift for range toggles); the new value goes through v-model.
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  partial: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue', 'toggle'])

function onClick(event) {
  const value = !props.modelValue
  emit('update:modelValue', value)
  emit('toggle', value, event)
}
</script>

<template>
  <button
    type="button"
    role="checkbox"
    class="checkbox"
    :class="{ checked: modelValue, partial: partial && !modelValue }"
    :aria-checked="partial && !modelValue ? 'mixed' : modelValue"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @click="onClick"
  >
    <svg v-if="modelValue" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2l2 2 4-4.4" /></svg>
    <svg v-else-if="partial" viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 5h5" /></svg>
  </button>
</template>

<style scoped>
.checkbox {
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  padding: 0;
  background: #181818;
  border: 1.5px solid #777777;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.checkbox:hover:not(:disabled) {
  border-color: #cccccc;
}
.checkbox.checked,
.checkbox.partial {
  background: #0a84ff;
  border-color: #0a84ff;
}
.checkbox:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px #0a84ff;
}
.checkbox:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.checkbox svg {
  width: 10px;
  height: 10px;
  fill: none;
  stroke: #ffffff;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
