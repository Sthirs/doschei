const fs = require('fs');
let code = fs.readFileSync('apps/frontend/src/views/GroupDetailView.vue', 'utf8');

// Remove showSettings ref
code = code.replace("const showSettings = ref(false);", "");

// Replace settings buttons
const oldSettingsBtn = `<button
      v-if="group"
      type="button"
      class="hidden rounded-md border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/5 sm:inline-flex"
      @click="showSettings = !showSettings"
    >
      {{ showSettings ? 'Hide Settings' : 'Settings' }}
    </button>
    <button
      v-if="group"
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-slate-100 sm:hidden"
      aria-label="Toggle settings"
      @click="showSettings = !showSettings"
    >`;

const newSettingsBtn = `<button
      v-if="group"
      type="button"
      class="hidden rounded-md border border-white/10 px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:border-white/20 hover:bg-white/5 sm:inline-flex"
      @click="router.push({ name: 'group-settings', params: { id: groupId }, state: { groupName: group.name } })"
    >
      Settings
    </button>
    <button
      v-if="group"
      type="button"
      class="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-slate-100 sm:hidden"
      aria-label="Toggle settings"
      @click="router.push({ name: 'group-settings', params: { id: groupId }, state: { groupName: group.name } })"
    >`;

code = code.replace(oldSettingsBtn, newSettingsBtn);

// Remove settings panel import and usage
code = code.replace("import GroupSettingsPanel from '@/components/GroupSettingsPanel.vue';", "");
code = code.replace("<GroupSettingsPanel v-if=\"showSettings\" :group=\"group\" @updated=\"loadGroup\" />", "");

// Update onMounted
code = code.replace("onMounted(loadGroup);", `onMounted(() => {
  if (history.state.groupName) {
    route.meta.title = history.state.groupName;
  }
  loadGroup();
});`);

fs.writeFileSync('apps/frontend/src/views/GroupDetailView.vue', code);
