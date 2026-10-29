import { ref } from 'vue'

const toast = ref(null)
let timer = null

export function useToast() {
  function show(message, kind = 'info', duration = 4000) {
    clearTimeout(timer)
    toast.value = { message, kind }
    timer = setTimeout(() => { toast.value = null }, duration)
  }
  return { toast, show }
}
