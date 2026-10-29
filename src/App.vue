<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ToolRail from './components/shell/ToolRail.vue'
import TrackBar from './components/shell/TrackBar.vue'
import ToastHost from './components/ui/ToastHost.vue'
import { tools, findTool } from './tools/registry.js'
import { useTimeline } from './composables/useTimeline.js'
import { loadValue, saveValue } from './composables/useToolSettings.js'

const activeId = ref(findTool(loadValue('active-tool', '')).id)
const activeTool = computed(() => findTool(activeId.value))

function selectTool(id) {
  activeId.value = id
  saveValue('active-tool', id)
}

// Re-read the track whenever the operator comes back to the plugin window
// (e.g. after selecting layers or moving the playhead in Designer). No polling.
const { refresh } = useTimeline()
const onFocus = () => refresh().catch(() => {})

onMounted(() => {
  onFocus()
  window.addEventListener('focus', onFocus)
})
onBeforeUnmount(() => window.removeEventListener('focus', onFocus))
</script>

<template>
  <div class="app">
    <ToolRail :tools="tools" :active-id="activeId" @select="selectTool" />
    <div class="workspace">
      <TrackBar />
      <main class="tool-host">
        <KeepAlive>
          <component :is="activeTool.component" :key="activeTool.id" />
        </KeepAlive>
      </main>
    </div>
    <ToastHost />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  height: 100vh;
  background: #1a1a1a;
}
.workspace {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.tool-host {
  container-type: inline-size;
  flex: 1;
  min-height: 0;
}
</style>
