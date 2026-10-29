<script setup>
defineProps({
  label: { type: String, default: '' },
  hint: { type: String, default: '' },
  error: { type: String, default: '' },
})
</script>

<template>
  <div class="form-row">
    <div v-if="label || $slots.action" class="form-label-row">
      <span class="form-label">{{ label }}</span>
      <slot name="action" />
    </div>
    <slot />
    <span v-if="error" class="form-error">{{ error }}</span>
    <span v-else-if="hint" class="form-hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.form-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-height: 18px;
}
.form-label {
  color: #d4d4d4;
  font-size: 12px;
  font-weight: 600;
}
.form-hint {
  color: #9c9c9c;
  font-size: 11px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
.form-error {
  color: #ef4444;
  font-size: 11px;
  line-height: 1.4;
}
</style>
