<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'

// Custom dropdown (a native <select> list ignores the palette).
// options: [{ value, label, meta?, separatorAfter? }]
const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options: { type: Array, required: true },
  placeholder: { type: String, default: 'Select...' },
  ariaLabel: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const LIST_MAX_HEIGHT = 320
const open = ref(false)
const activeIndex = ref(-1)
const trigger = ref(null)
const list = ref(null)
const listStyle = ref({})

const selected = computed(() => props.options.find((o) => o.value === props.modelValue))

function place() {
  const rect = trigger.value.getBoundingClientRect()
  const below = window.innerHeight - rect.bottom - 8
  const above = rect.top - 8
  const flip = below < Math.min(LIST_MAX_HEIGHT, 160) && above > below
  listStyle.value = {
    left: `${rect.left}px`,
    minWidth: `${Math.max(rect.width, 220)}px`,
    maxHeight: `${Math.min(LIST_MAX_HEIGHT, flip ? above : below)}px`,
    ...(flip ? { bottom: `${window.innerHeight - rect.top + 4}px` } : { top: `${rect.bottom + 4}px` }),
  }
}

async function show() {
  if (props.disabled || open.value) return
  place()
  activeIndex.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue))
  open.value = true
  document.addEventListener('mousedown', onOutside, true)
  window.addEventListener('resize', hide)
  window.addEventListener('blur', hide)
  await nextTick()
  list.value?.children[activeIndex.value]?.scrollIntoView({ block: 'nearest' })
}

function hide() {
  open.value = false
  document.removeEventListener('mousedown', onOutside, true)
  window.removeEventListener('resize', hide)
  window.removeEventListener('blur', hide)
}

function choose(option) {
  emit('update:modelValue', option.value)
  hide()
  trigger.value?.focus()
}

function onOutside(event) {
  if (!trigger.value?.contains(event.target) && !list.value?.contains(event.target)) hide()
}

function move(delta) {
  const n = props.options.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  nextTick(() => list.value?.children[activeIndex.value]?.scrollIntoView({ block: 'nearest' }))
}

function onKeydown(event) {
  if (!open.value) {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      show()
    }
    return
  }
  if (event.key === 'ArrowDown') move(1)
  else if (event.key === 'ArrowUp') move(-1)
  else if (event.key === 'Enter' || event.key === ' ') {
    const option = props.options[activeIndex.value]
    if (option) choose(option)
  } else if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') event.preventDefault()
    hide()
    return
  } else return
  event.preventDefault()
}

onBeforeUnmount(hide)
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="dropdown-trigger"
    :class="{ open }"
    :disabled="disabled"
    :aria-label="ariaLabel"
    aria-haspopup="listbox"
    :aria-expanded="open"
    @click="open ? hide() : show()"
    @keydown="onKeydown"
  >
    <span class="trigger-label" :class="{ placeholder: !selected }">{{ selected ? selected.label : placeholder }}</span>
    <svg class="chevron" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" /></svg>
  </button>

  <Teleport to="body">
    <ul v-if="open" ref="list" class="dropdown-list" role="listbox" :style="listStyle">
      <li
        v-for="(option, i) in options"
        :key="option.value"
        class="dropdown-item"
        :class="{ selected: option.value === modelValue, active: i === activeIndex, separated: option.separatorAfter }"
        role="option"
        :aria-selected="option.value === modelValue"
        @mouseenter="activeIndex = i"
        @click="choose(option)"
      >
        <span class="item-label">{{ option.label }}</span>
        <span v-if="option.meta" class="item-meta">{{ option.meta }}</span>
      </li>
    </ul>
  </Teleport>
</template>

<style scoped>
.dropdown-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  min-width: 0;
  max-width: 100%;
  padding: 0 8px 0 10px;
  background: #181818;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  color: #eeeeee;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.dropdown-trigger:hover:not(:disabled) {
  border-color: #555555;
}
.dropdown-trigger:focus-visible,
.dropdown-trigger.open {
  outline: none;
  border-color: #0a84ff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
}
.dropdown-trigger:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.trigger-label.placeholder {
  color: #888888;
}
.chevron {
  flex: none;
  width: 10px;
  height: 10px;
  margin-left: auto;
  fill: none;
  stroke: #aeaeae;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}
.dropdown-trigger.open .chevron {
  transform: rotate(180deg);
}

.dropdown-list {
  position: fixed;
  z-index: 1000;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  overflow-y: auto;
  background: #1e1e1e;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}
.dropdown-list::-webkit-scrollbar {
  width: 6px;
}
.dropdown-list::-webkit-scrollbar-thumb {
  background: #333333;
  border-radius: 3px;
}
.dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  color: #eeeeee;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s ease;
}
.dropdown-item.active {
  background: #3a3a3a;
}
.dropdown-item.selected {
  background: rgba(10, 132, 255, 0.2);
  color: #0a84ff;
  font-weight: 600;
}
.dropdown-item.separated {
  border-bottom: 1px solid #2e2e2e;
  margin-bottom: 4px;
}
.item-label {
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-meta {
  margin-left: auto;
  color: #9c9c9c;
  font-size: 11px;
  font-weight: 400;
}
</style>
