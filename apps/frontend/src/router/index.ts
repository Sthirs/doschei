import { ref } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

const LoginView = () => import('@/views/LoginView.vue');
const AuthCallbackView = () => import('@/views/AuthCallbackView.vue');
const GroupsView = () => import('@/views/GroupsView.vue');
const GroupDetailView = () => import('@/views/GroupDetailView.vue');
const AccountView = () => import('@/views/AccountView.vue');
const GroupSettingsView = () => import('@/views/GroupSettingsView.vue');
const ExpenseFormView = () => import('@/views/ExpenseFormView.vue');
const SettleUpView = () => import('@/views/SettleUpView.vue');

export const currentPageTitle = ref<string | null>(null);

// Carry a group payload across navigation to expense/settle-up views so the
// target page does not need to re-fetch GET /groups/:id.
import type { GroupDetail } from '@/types/group';
export const sharedGroup = ref<GroupDetail | null>(null);


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
      path: '/groups/:id/expenses/new',
      name: 'expense-new',
      component: ExpenseFormView,
      meta: { requiresAuth: true, title: 'Add Expense' },
    },
    {
      path: '/groups/:id/expenses/:expenseId/edit',
      name: 'expense-edit',
      component: ExpenseFormView,
      meta: { requiresAuth: true, title: 'Edit Expense' },
    },
    {
      path: '/groups/:id/settle-up',
      name: 'settleup-new',
      component: SettleUpView,
      meta: { requiresAuth: true, title: 'Settle Up' },
    },
    {
      path: '/groups/:id/settlements/:sid/edit',
      name: 'settleup-edit',
      component: SettleUpView,
      meta: { requiresAuth: true, title: 'Edit Payment' },
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
