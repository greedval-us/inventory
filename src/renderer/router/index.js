import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../views/Home.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/sections/new', name: 'new-section', component: () => import('../registry/SchemaDesigner.vue') },
    { path: '/collections/:id(\\d+)', name: 'collection', component: Home },
    { path: '/sections/:id(\\d+)', name: 'section', component: Home },
    { path: '/settings', name: 'settings', component: () => import('../views/Settings.vue') },
    { path: '/info', name: 'info', component: () => import('../views/Info.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
