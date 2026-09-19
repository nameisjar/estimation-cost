import { createApp } from 'vue';
import App from './App.vue';
import AdminApp from './AdminApp.vue';
import './style.css';
import './admin.css';
const adminPage = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
if (adminPage) document.body.classList.add('admin-page');
createApp(adminPage ? AdminApp : App).mount('#app');
