import { ref } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

const LoginView = () => import('@/views/LoginView.vue');
const AuthCallbackView = () => import('@/views/AuthCallbackView.vue');
const GroupsView = () => import('@/views/GroupsView.vue');
const GroupDetailView = () => import('@/views/GroupDetailView.vue');
const AccountView = () => import('@/views/AccountView.vue');
const GroupSettingsView = () => import('@/views/GroupSettingsView.vue');

export const currentPageTitle = ref<string | null>(null);


export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/groups',
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { guestOnly: true },
    },
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: AuthCallbackView,
      meta: { guestOnly: true },
    },
    {
      path: '/groups',
      name: 'groups',
      component: GroupsView,
      meta: { requiresAuth: true, title: 'Groups' },
    },
    {
      path: '/groups/:id',
      name: 'group-detail',
      component: GroupDetailView,
      meta: { requiresAuth: true, title: 'Group' },
    },
    {
      path: '/groups/:id/settings',
      name: 'group-settings',
      component: GroupSettingsView,
      meta: { requiresAuth: true, title: 'Group Settings' },
    },
    {
      path: '/account',
      name: 'account',
      component: AccountView,
      meta: { requiresAuth: true, title: 'Account' },
    },
  ],
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();

  if (authStore.token && !authStore.user) {
    await authStore.fetchCurrentUser();
  }

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }

  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return { name: 'groups' };
  }

  return true;
});
