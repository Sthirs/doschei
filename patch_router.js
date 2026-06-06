const fs = require('fs');
let code = fs.readFileSync('apps/frontend/src/router/index.ts', 'utf8');

const importSettings = "const GroupSettingsView = () => import('@/views/GroupSettingsView.vue');\n";
code = code.replace("const AccountView = () => import('@/views/AccountView.vue');", "const AccountView = () => import('@/views/AccountView.vue');\n" + importSettings);

const settingsRoute = `    {
      path: '/groups/:id/settings',
      name: 'group-settings',
      component: GroupSettingsView,
      meta: { requiresAuth: true, title: 'Group Settings' },
    },
`;

code = code.replace("    {\n      path: '/account'", settingsRoute + "    {\n      path: '/account'");

fs.writeFileSync('apps/frontend/src/router/index.ts', code);
