<script setup>
defineProps({
  title: { type: String, required: true },
})
</script>

<template>
  <section class="settings-group">
    <h3 class="settings-group-header">{{ title }}</h3>
    <div class="settings-group-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.settings-group {
  background: #242424;
  border: 1px solid #333333;
  border-radius: 6px;
  padding: 14px;
}
.settings-group-header {
  margin: 0 0 12px;
  color: #0a84ff;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.settings-group-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
