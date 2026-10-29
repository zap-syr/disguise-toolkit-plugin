<script setup>
// Integer field with - / + buttons. Replaces the native number spinner, which ignores the palette.
const props = defineProps({
  modelValue: { type: Number, default: NaN },
  min: { type: Number, default: -Infinity },
  max: { type: Number, default: Infinity },
  invalid: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  ariaLabel: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])

const clamp = (v) => Math.min(props.max, Math.max(props.min, v))

function stepBy(delta) {
  const base = Number.isFinite(props.modelValue) ? props.modelValue : props.min > -Infinity ? props.min : 0
  emit('update:modelValue', clamp(Math.trunc(base) + delta))
}

function onInput(event) {
  const raw = event.target.value.replace(/[^\d-]/g, '')
  if (raw !== event.target.value) event.target.value = raw
  // Empty or partial input stays NaN, so validation shows it instead of silently snapping to a number.
  emit('update:modelValue', raw === '' || raw === '-' ? NaN : Number(raw))
}

function onKeydown(event) {
  if (event.key === 'ArrowUp') stepBy(1)
  else if (event.key === 'ArrowDown') stepBy(-1)
  else return
  event.preventDefault()
}
</script>

<template>
  <div class="stepper" :class="{ invalid, disabled }">
    <button
      type="button"
      class="step-btn"
      tabindex="-1"
      aria-label="Decrease"
      :disabled="disabled || modelValue <= min"
      @click="stepBy(-1)"
    >
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7" /></svg>
    </button>
    <input
      class="step-input"
      type="text"
      inputmode="numeric"
      :value="Number.isFinite(modelValue) ? modelValue : ''"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-invalid="invalid"
      autocomplete="off"
      @input="onInput"
      @keydown="onKeydown"
    />
    <button
      type="button"
      class="step-btn"
      tabindex="-1"
      aria-label="Increase"
      :disabled="disabled || modelValue >= max"
      @click="stepBy(1)"
    >
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7 M6 2.5v7" /></svg>
    </button>
  </div>
</template>

<style scoped>
.stepper {
  display: flex;
  align-items: stretch;
  height: 30px;
  min-width: 0;
  background: #181818;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.stepper:hover:not(.disabled):not(:focus-within) {
  border-color: #555555;
}
.stepper:focus-within {
  border-color: #0a84ff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
}
.stepper.invalid {
  border-color: #ef4444;
}
.stepper.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.step-input {
  flex: 1;
  min-width: 0;
  width: 100%;
  background: transparent;
  border: none;
  color: #eeeeee;
  font-size: 12px;
  font-family: inherit;
  font-variant-numeric: tabular-nums;
  text-align: center;
  padding: 0 4px;
}
.step-input:focus {
  outline: none;
}
.step-input:disabled {
  cursor: not-allowed;
}
.step-btn {
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  background: #1e1e1e;
  border: none;
  color: #aeaeae;
  cursor: pointer;
  transition: all 0.2s ease;
}
.step-btn:first-child {
  border-right: 1px solid #2e2e2e;
}
.step-btn:last-child {
  border-left: 1px solid #2e2e2e;
}
.step-btn:hover:not(:disabled) {
  background: #2a2a2a;
  color: #ffffff;
}
.step-btn:active:not(:disabled) {
  background: #333333;
}
.step-btn:disabled {
  color: #555555;
  cursor: not-allowed;
}
.step-btn svg {
  width: 12px;
  height: 12px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
}
</style>
