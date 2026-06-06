<script setup lang="ts">
import { ref } from 'vue';

import { api } from '@/lib/api';
import type { GroupDetail, GroupMember } from '@/types/group';

const props = defineProps<{
  group: GroupDetail;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const groupName = ref(props.group.name);
const isSubmittingName = ref(false);
const nameError = ref('');

const memberEmail = ref('');
const isSubmittingMember = ref(false);
const memberError = ref('');
const memberSuccess = ref('');

const removingMemberId = ref<string | null>(null);

const saveName = async () => {
  if (!groupName.value.trim()) {
    nameError.value = 'Group name cannot be empty.';
    return;
  }

  isSubmittingName.value = true;
  nameError.value = '';

  try {
    await api.patch(`/groups/${props.group.id}`, { name: groupName.value.trim() });
    emit('updated');
  } catch {
    nameError.value = 'Could not update the group name.';
  } finally {
    isSubmittingName.value = false;
  }
};

const addMember = async () => {
  if (!memberEmail.value.trim()) {
    memberError.value = 'Please enter an email address.';
    return;
  }

  isSubmittingMember.value = true;
  memberError.value = '';
  memberSuccess.value = '';

  try {
    await api.post(`/groups/${props.group.id}/members`, { email: memberEmail.value.trim().toLowerCase() });
    memberEmail.value = '';
    memberSuccess.value = 'Member added successfully.';
    emit('updated');
  } catch (error: unknown) {
    const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    memberError.value = msg || 'Could not add member.';
  } finally {
    isSubmittingMember.value = false;
  }
};

const removeMember = async (member: GroupMember) => {
  removingMemberId.value = member.id;

  try {
    await api.delete(`/groups/${props.group.id}/members/${member.id}`);
    emit('updated');
  } catch {
    memberError.value = `Could not remove ${member.displayName}.`;
  } finally {
    removingMemberId.value = null;
  }
};
</script>

<template>
  <section class="glass-panel flex flex-col gap-6 rounded-md px-6 py-5 sm:px-8">
    <h2 class="text-sm font-medium uppercase tracking-wide text-slate-400">Settings</h2>

    <form class="flex flex-col gap-3" @submit.prevent="saveName">
      <label class="flex flex-col gap-1.5">
        <span class="text-sm text-slate-300">Group Name</span>
        <div class="flex gap-2">
          <input
            v-model="groupName"
            type="text"
            class="flex-1 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
          />
          <button
            type="submit"
            class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-brand-400 disabled:opacity-60"
            :disabled="isSubmittingName || groupName.trim() === props.group.name"
          >
            Save
          </button>
        </div>
      </label>
      <p v-if="nameError" class="text-sm text-rose-300">{{ nameError }}</p>
    </form>

    <div class="border-t border-white/10 pt-4">
      <h3 class="mb-3 text-sm font-medium text-slate-300">Members</h3>

      <ul class="mb-4 flex flex-col gap-2">
        <li
          v-for="member in props.group.members"
          :key="member.id"
          class="flex items-center justify-between rounded-md border border-white/5 px-3 py-2"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-slate-100">{{ member.displayName }}</p>
            <p class="truncate text-xs text-slate-400">{{ member.email }}</p>
          </div>
          <button
            type="button"
            class="ml-2 shrink-0 rounded px-2 py-1 text-xs text-rose-400 transition hover:bg-rose-500/10 disabled:opacity-60"
            :disabled="removingMemberId === member.id || props.group.members.length <= 1"
            @click="removeMember(member)"
          >
            Remove
          </button>
        </li>
      </ul>

      <form class="flex gap-2" @submit.prevent="addMember">
        <input
          v-model="memberEmail"
          type="email"
          placeholder="user@example.com"
          class="flex-1 rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-400 focus:border-brand-500/40 focus:bg-white/10"
        />
        <button
          type="submit"
          class="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-brand-400 disabled:opacity-60"
          :disabled="isSubmittingMember"
        >
          Add
        </button>
      </form>

      <p v-if="memberError" class="mt-2 text-sm text-rose-300">{{ memberError }}</p>
      <p v-if="memberSuccess" class="mt-2 text-sm text-emerald-300">{{ memberSuccess }}</p>
    </div>
  </section>
</template>
