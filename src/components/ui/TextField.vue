<script setup>
import { ref } from 'vue'

// Text input. For integers use NumberStepper. clearable adds an x button while there is text.
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  invalid: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  clearable: { type: Boolean, default: false },
  maxlength: { type: Number, default: undefined },
  ariaLabel: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])

const input = ref(null)

// Focus stays in the field, so typing can go on right away.
function clear() {
  emit('update:modelValue', '')
  input.value?.focus()
}
</script>

<template>
  <div class="field" :class="{ 'has-clear': clearable && modelValue && !disabled }">
    <input
      ref="input"
      class="input"
      :class="{ invalid }"
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :maxlength="maxlength"
      :aria-label="ariaLabel"
      :aria-invalid="invalid"
      spellcheck="false"
      autocomplete="off"
      @input="$emit('update:modelValue', $event.target.value)"
    />
    <button
      v-if="clearable && modelValue && !disabled"
      type="button"
      class="clear-btn"
      tabindex="-1"
      title="Clear"
      :aria-label="ariaLabel ? `Clear ${ariaLabel}` : 'Clear'"
      @mousedown.prevent
      @click="clear"
    >
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6 M9 3L3 9" /></svg>
    </button>
  </div>
</template>

<style scoped>
.field {
  position: relative;
  width: 100%;
  min-width: 0;
}
.input {
  width: 100%;
  min-width: 0;
  height: 30px;
  background: #181818;
  border: 1px solid #3a3a3a;
  color: #eeeeee;
  border-radius: 6px;
  padding: 0 10px;
  font-size: 12px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
/* Room for the clear button, so long text never runs under it. */
.has-clear .input {
  padding-right: 30px;
}
.input::placeholder {
  color: #888888;
}
.input:hover:not(:disabled):not(:focus) {
  border-color: #555555;
}
.input:focus {
  outline: none;
  border-color: #0a84ff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
}
.input.invalid {
  border-color: #ef4444;
}
.input:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.clear-btn {
  position: absolute;
  top: 50%;
  right: 5px;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #9c9c9c;
  cursor: pointer;
  transition: all 0.2s ease;
}
.clear-btn:hover {
  background: #333333;
  color: #ffffff;
}
.clear-btn svg {
  width: 10px;
  height: 10px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}
</style>
