<script setup>
// Text input. For integers use NumberStepper.
defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '' },
  invalid: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  maxlength: { type: Number, default: undefined },
  ariaLabel: { type: String, default: undefined },
})
defineEmits(['update:modelValue'])
</script>

<template>
  <input
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
</template>

<style scoped>
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
</style>
