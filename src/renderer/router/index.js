import { createRouter, createWebHashHistory } from 'vue-router';
import Home from '../views/Home.vue';
import Settings from '../views/Settings.vue';
import Info from '../views/Info.vue';
import SchemaDesigner from '../registry/SchemaDesigner.vue';

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: Home },
    { path: '/sections/new', name: 'new-section', component: SchemaDesigner },
    { path: '/collections/:id(\\d+)', name: 'collection', component: Home },
    { path: '/sections/:id(\\d+)', name: 'section', component: Home },
    { path: '/settings', name: 'settings', component: Settings },
    { path: '/info', name: 'info', component: Info },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});
