<script setup>
import { useToast } from '../../composables/useToast.js'

const { toast } = useToast()
</script>

<template>
  <Transition name="toast">
    <div v-if="toast" class="toast" :class="toast.kind" role="status">{{ toast.message }}</div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 64px;
  transform: translateX(-50%);
  z-index: 1000;
  max-width: min(520px, calc(100vw - 32px));
  background: #242424;
  color: #dddddd;
  font-size: 12px;
  line-height: 1.4;
  border: 1px solid #0a84ff;
  border-radius: 6px;
  padding: 10px 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}
.toast.error {
  border-color: #ef4444;
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
