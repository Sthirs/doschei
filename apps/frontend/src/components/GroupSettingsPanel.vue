<script setup lang="ts">
import { ref } from 'vue';

import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import type { GroupDetail, GroupMember, PendingInvitation } from '@/types/group';

const props = defineProps<{
  group: GroupDetail;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const authStore = useAuthStore();

const initialsOf = (name: string): string => {
  if (!name || !name.trim()) return '';
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
};

const isCurrentUser = (memberId: string): boolean => {
  return authStore.user?.id === memberId;
};

const groupName = ref(props.group.name);
const isSubmittingName = ref(false);
const nameError = ref('');

const memberEmail = ref('');
const isSubmittingMember = ref(false);
const memberError = ref('');

const removingMemberId = ref<string | null>(null);
const cancellingInvitationId = ref<string | null>(null);

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

  try {
    await api.post(`/groups/${props.group.id}/members`, {
      email: memberEmail.value.trim().toLowerCase(),
    });
    memberEmail.value = '';
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

const cancelInvitation = async (invitation: PendingInvitation) => {
  cancellingInvitationId.value = invitation.id;

  try {
    await api.delete(`/groups/${props.group.id}/invitations/${invitation.id}`);
    emit('updated');
  } catch {
    memberError.value = `Could not cancel invitation for ${invitation.email}.`;
  } finally {
    cancellingInvitationId.value = null;
  }
};
</script>

<template>
  <section class="flex flex-col gap-6 px-4 py-5 sm:px-6">
    <!-- 1. Group picture (read-only, only when imageUrl set) -->
    <div
      v-if="props.group.imageUrl"
      class="flex justify-center"
    >
      <img
        :src="props.group.imageUrl"
        :alt="`${props.group.name} image`"
        class="h-24 w-24 rounded-full object-cover"
      />
    </div>

    <!-- 2. GROUP NAME -->
    <div class="flex flex-col gap-2">
      <label class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7]">
        GROUP NAME
      </label>
      <input
        v-model="groupName"
        type="text"
        class="w-full rounded-xl border border-transparent bg-[#201F27] px-4 py-3 text-base text-[#E5E0ED] outline-none transition placeholder:text-[#C8C4D7] focus:border-[#6554E7]/40"
        style="height: 48px"
      />
      <p v-if="nameError" class="text-sm text-[#FFB4AB]">{{ nameError }}</p>
    </div>

    <!-- 3. ADD MEMBERS -->
    <div class="flex flex-col gap-2">
      <label class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7]">
        ADD MEMBERS
      </label>
      <form class="flex gap-2" @submit.prevent="addMember">
        <div class="relative flex-1">
          <!-- person-plus icon prefix -->
          <svg
            class="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#C8C4D7]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="16" y1="11" x2="22" y2="11" />
          </svg>
          <input
            v-model="memberEmail"
            type="email"
            placeholder="user@example.com"
            class="w-full rounded-xl border border-transparent bg-[#201F27] py-3 pl-10 pr-4 text-base text-[#E5E0ED] outline-none transition placeholder:text-[#C8C4D7] focus:border-[#6554E7]/40"
            style="height: 48px"
          />
        </div>
        <button
          type="submit"
          class="shrink-0 rounded-xl bg-[#201F27] px-4 text-sm font-medium uppercase tracking-wide text-[#E5E0ED] transition hover:bg-[#2a2933] disabled:opacity-60"
          style="width: 80px"
          :disabled="isSubmittingMember"
        >
          ADD
        </button>
      </form>
      <p v-if="memberError" class="text-sm text-[#FFB4AB]">{{ memberError }}</p>
    </div>

    <!-- 4. MEMBERS -->
    <div class="flex flex-col gap-2">
      <label class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7]">
        MEMBERS ({{ props.group.members.length }})
      </label>
      <ul class="flex flex-col gap-1">
        <li
          v-for="member in props.group.members"
          :key="member.id"
          class="flex items-center gap-3 rounded-xl px-2 py-2"
        >
          <!-- Avatar -->
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#6554E7] to-[#4a485d] text-sm font-semibold text-white"
          >
            {{ isCurrentUser(member.id) ? 'ME' : initialsOf(member.displayName) }}
          </div>
          <!-- Name + email -->
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-[#E5E0ED]">
              {{ isCurrentUser(member.id) ? 'You' : member.displayName }}
            </p>
            <p class="truncate text-xs text-[#C8C4D7]">
              {{ isCurrentUser(member.id) ? 'Admin' : member.email }}
            </p>
          </div>
          <!-- Remove button: only when >1 members AND not current user -->
          <button
            v-if="props.group.members.length > 1 && !isCurrentUser(member.id)"
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#C8C4D7] transition hover:bg-white/10 hover:text-[#E5E0ED] disabled:opacity-60"
            aria-label="Remove member"
            :disabled="removingMemberId === member.id"
            @click="removeMember(member)"
          >
            <svg viewBox="0 0 20 20" class="h-4 w-4 fill-current">
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </li>
      </ul>
    </div>

    <!-- 5. PENDING INVITATIONS -->
    <div
      v-if="props.group.pendingInvitations && props.group.pendingInvitations.length > 0"
      class="flex flex-col gap-2"
    >
      <label class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7]">
        PENDING INVITATIONS
      </label>
      <ul class="flex flex-col gap-1">
        <li
          v-for="invitation in props.group.pendingInvitations"
          :key="invitation.id"
          class="flex items-center gap-3 rounded-xl px-2 py-2"
        >
          <!-- Email only, no avatar -->
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-[#E5E0ED]">
              {{ invitation.email }}
            </p>
          </div>
          <!-- Cancel button -->
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#C8C4D7] transition hover:bg-white/10 hover:text-[#E5E0ED] disabled:opacity-60"
            aria-label="Cancel invitation"
            :disabled="cancellingInvitationId === invitation.id"
            @click="cancelInvitation(invitation)"
          >
            <svg viewBox="0 0 20 20" class="h-4 w-4 fill-current">
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        </li>
      </ul>
    </div>

    <!-- 6. Save button -->
    <button
      type="button"
      class="w-full rounded-xl bg-[#6554E7] py-3.5 text-base font-medium text-[#F0EBFF] transition hover:bg-[#5a44cf] disabled:cursor-not-allowed disabled:opacity-60"
      style="height: 52px"
      :disabled="isSubmittingName || groupName.trim() === props.group.name"
      @click="saveName"
    >
      Save
    </button>
  </section>
</template>
