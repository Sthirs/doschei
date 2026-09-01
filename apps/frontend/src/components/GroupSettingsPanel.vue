<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import { useGroupSettings } from '@/composables/useGroupSettings';
import type { GroupDetail } from '@/types/group';

const props = defineProps<{
  group: GroupDetail;
}>();

const emit = defineEmits<{
  updated: [];
}>();

const { t } = useI18n();

const {
  initialsOf,
  isCurrentUser,
  groupName,
  nameError,
  isSubmittingName,
  memberEmail,
  memberError,
  isSubmittingMember,
  removingMemberId,
  cancellingInvitationId,
  isUploading,
  uploadError,
  handleFileChange,
  saveName,
  addMember,
  removeMember,
  cancelInvitation,
} = useGroupSettings(
  () => props.group,
  () => emit('updated'),
  {
    groupNameEmpty: () => t('groupSettings.groupNameEmpty'),
    updateNameError: () => t('groupSettings.updateNameError'),
    addMemberEmailEmpty: () => t('groupSettings.addMemberEmailEmpty'),
    addMemberError: () => t('groupSettings.addMemberError'),
    removeMemberError: (name) => t('groupSettings.removeMemberError', { name }),
    cancelInvitationError: (email) =>
      t('groupSettings.cancelInvitationError', { email }),
    imageInvalidType: () => t('groupSettings.changeImageErrorInvalid'),
    imageTooLarge: () => t('groupSettings.changeImageErrorTooLarge'),
    imageUploadFailed: () => t('groupSettings.changeImageErrorGeneric'),
  },
);
</script>

<template>
  <section class="flex flex-col gap-6 px-4 py-5 sm:px-6">
    <!-- 1. Group image picker -->
    <div class="relative w-full" data-testid="group-image-picker">
      <!-- Image banner: ~16:10 aspect ratio, rounded-xl -->
      <div class="relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-[#201F27]">
        <!-- Image or placeholder -->
        <div
          v-if="props.group.imageUrl"
          class="absolute inset-0"
        >
          <img
            :src="props.group.imageUrl"
            :alt="t('groups.groupImageAria', { name: props.group.name })"
            class="h-full w-full object-cover"
            data-testid="group-image-preview"
          />
        </div>
        <div
          v-else
          class="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#6554E7] to-[#4a485d] text-white font-semibold text-4xl"
          :aria-label="t('groups.thumbnailAria', { name: props.group.name })"
        >
          {{ initialsOf(props.group.name) }}
        </div>

        <!-- Camera button bottom-right -->
        <label
          for="group-image-upload"
          data-testid="group-image-edit"
          class="absolute bottom-4 right-4 flex w-10 h-10 items-center justify-center rounded-full bg-[#6554E7] text-[#F0EBFF] shadow-lg transition hover:bg-[#5a44cf] cursor-pointer"
          :aria-label="t('groupSettings.changeImage')"
          :class="{ 'opacity-60 pointer-events-none': isUploading }"
        >
          <img src="/icons/camera.svg" alt="" aria-hidden="true" class="h-5 w-5" />
        </label>

        <!-- Uploading overlay -->
        <div
          v-if="isUploading"
          class="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl"
        >
          <p class="text-sm text-[#C8C4D7]">{{ t('groupSettings.imageUploading') }}</p>
        </div>
      </div>

      <!-- Hidden file input -->
      <input
        id="group-image-upload"
        data-testid="group-image-input"
        type="file"
        accept="image/*"
        class="absolute inset-0 opacity-0 pointer-events-none"
        aria-hidden="true"
        :disabled="isUploading"
        @change="handleFileChange"
      />

      <!-- Upload error -->
      <p v-if="uploadError" data-testid="image-upload-error" class="mt-2 text-sm text-[#FFB4AB] text-center">{{ uploadError }}</p>
    </div>

    <!-- 2. GROUP NAME -->
    <div class="flex flex-col gap-2">
      <label class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7]">
        {{ t('groupSettings.groupNameLabel') }}
      </label>
      <input
        v-model="groupName"
        type="text"
        data-testid="group-name-input"
        class="w-full rounded-xl border border-transparent bg-[#201F27] px-4 py-3 text-base text-[#E5E0ED] outline-none transition placeholder:text-[#C8C4D7] focus:border-[#6554E7]/40"
        style="height: 48px"
      />
      <p v-if="nameError" class="text-sm text-[#FFB4AB]">{{ nameError }}</p>
    </div>

    <!-- 3. ADD MEMBERS -->
    <div class="flex flex-col gap-2">
      <label class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7]">
        {{ t('groupSettings.addMembersLabel') }}
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
            :placeholder="t('groupSettings.emailPlaceholder')"
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
          {{ t('groupSettings.add') }}
        </button>
      </form>
      <p v-if="memberError" class="text-sm text-[#FFB4AB]">{{ memberError }}</p>
    </div>

    <!-- 4. MEMBERS -->
    <div class="flex flex-col gap-2">
      <label class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7]">
        {{ t('groupSettings.membersLabel', { count: props.group.members.length }) }}
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
            <img
              v-if="member.imageUrl"
              :src="member.imageUrl"
              alt=""
              aria-hidden="true"
              class="h-full w-full rounded-full object-cover"
            />
            <span v-else>{{ initialsOf(member.displayName) }}</span>
          </div>
          <!-- Name + email -->
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-[#E5E0ED]">
              {{ isCurrentUser(member.id) ? t('groupSettings.youLabel') : member.displayName }}
            </p>
            <p class="truncate text-xs text-[#C8C4D7]">
              {{ member.email }}
            </p>
          </div>
          <!-- Remove button: only when >1 members AND not current user -->
          <button
            v-if="props.group.members.length > 1 && !isCurrentUser(member.id)"
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#C8C4D7] transition hover:bg-white/10 hover:text-[#E5E0ED] disabled:opacity-60"
            :aria-label="t('groupSettings.removeMemberAria')"
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

    <!-- 5. {{ t('groupSettings.pendingInvitationsLabel') }} -->
    <div
      v-if="props.group.pendingInvitations && props.group.pendingInvitations.length > 0"
      data-testid="pending-invitations-section"
      class="flex flex-col gap-2"
    >
      <label class="font-display text-xs font-medium uppercase tracking-[0.05em] text-[#C8C4D7]">
        {{ t('groupSettings.pendingInvitationsLabel') }}
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
            :aria-label="t('groupSettings.cancelInvitationAria')"
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
      {{ t('groupSettings.save') }}
    </button>
  </section>
</template>
