import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './appearance/font-assets.css';
import './style.css';
import './registry/registry.css';
import './registry/forms.css';
import { router } from './router/index.js';

createApp(App).use(createPinia()).use(router).mount('#app');
