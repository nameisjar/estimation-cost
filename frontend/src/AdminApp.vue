<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, Database, Edit3,
  Eye, EyeOff, LoaderCircle, LogOut, MapPinned, Menu, Plus, Search, Store, WandSparkles, X,
} from 'lucide-vue-next';
import AdminPlaceForm from './components/admin/AdminPlaceForm.vue';
import { getConfig } from './services/estimate.service';
import {
  AdminApiError, adminLogin, adminLogout, createAdminPlace, enrichAdminPlaceAddress, getAdminPlaces,
  getAdminSession, getAdminStats, setAdminPlaceActive, updateAdminPlace,
  type AdminPlace, type AdminPlaceInput, type AdminSession, type AdminStats,
} from './services/admin.service';

const session = ref<AdminSession | null>(null);
const sessionLoading = ref(true);
const username = ref('admin');
const password = ref('');
const showPassword = ref(false);
const loginBusy = ref(false);
const loginError = ref('');
const places = ref<AdminPlace[]>([]);
const stats = ref<AdminStats>({ total: 0, active: 0, inactive: 0, missingAddress: 0 });
const dataBusy = ref(false);
const query = ref('');
const appliedQuery = ref('');
const status = ref('all');
const addressStatus = ref('all');
const page = ref(1);
const limit = 20;
const total = ref(0);
const sidebarOpen = ref(false);
const formOpen = ref(false);
const editingPlace = ref<AdminPlace | null>(null);
const saving = ref(false);
const enrichingPlaceId = ref('');
const formError = ref('');
const toast = ref('');
const serviceCenter = ref({ lat: -8.4932, lng: 140.4018 });
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const rangeLabel = computed(() => total.value
  ? `${(page.value - 1) * limit + 1}–${Math.min(page.value * limit, total.value)} dari ${total.value}`
  : '0 data');

function message(error: unknown) {
  return error instanceof Error ? error.message : 'Permintaan belum berhasil.';
}
function notify(value: string) {
  toast.value = value;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 3500);
}

async function loadData() {
  if (!session.value) return;
  dataBusy.value = true;
  try {
    const [placeData, statData] = await Promise.all([
      getAdminPlaces(appliedQuery.value, status.value, addressStatus.value, page.value, limit),
      getAdminStats(),
    ]);
    places.value = placeData.items;
    total.value = placeData.total;
    stats.value = statData;
    if (page.value > totalPages.value) { page.value = totalPages.value; await loadData(); }
  } catch (error) {
    if (error instanceof AdminApiError && error.status === 401) session.value = null;
    else notify(message(error));
  } finally { dataBusy.value = false; }
}

async function initialize() {
  try {
    session.value = await getAdminSession();
    const appConfig = await getConfig().catch(() => null);
    if (appConfig) serviceCenter.value = { lat: appConfig.serviceArea.centerLat, lng: appConfig.serviceArea.centerLng };
    await loadData();
  } catch { session.value = null; }
  finally { sessionLoading.value = false; }
}
onMounted(initialize);

async function login() {
  loginError.value = '';
  loginBusy.value = true;
  try {
    session.value = await adminLogin(username.value.trim(), password.value);
    password.value = '';
    await loadData();
  } catch (error) { loginError.value = message(error); }
  finally { loginBusy.value = false; }
}

async function logout() {
  try { await adminLogout(); } catch { /* cookie is cleared by session expiry if request fails */ }
  session.value = null;
  places.value = [];
}

function search() {
  appliedQuery.value = query.value.trim();
  page.value = 1;
  void loadData();
}
function filterStatus(value: string) {
  status.value = value;
  page.value = 1;
  void loadData();
}
function filterAddressStatus() {
  page.value = 1;
  void loadData();
}
function changePage(value: number) {
  page.value = Math.min(Math.max(value, 1), totalPages.value);
  void loadData();
}
function openAdd() { editingPlace.value = null; formError.value = ''; formOpen.value = true; }
function openEdit(place: AdminPlace) { editingPlace.value = place; formError.value = ''; formOpen.value = true; }

async function savePlace(value: AdminPlaceInput) {
  saving.value = true;
  formError.value = '';
  try {
    if (editingPlace.value) await updateAdminPlace(editingPlace.value.id, value);
    else await createAdminPlace(value);
    formOpen.value = false;
    notify(editingPlace.value ? 'Perubahan tempat berhasil disimpan.' : 'Tempat baru berhasil ditambahkan.');
    await loadData();
  } catch (error) { formError.value = message(error); }
  finally { saving.value = false; }
}

async function togglePlace(place: AdminPlace) {
  try {
    await setAdminPlaceActive(place.id, !place.active);
    notify(place.active ? 'Tempat dinonaktifkan.' : 'Tempat diaktifkan.');
    await loadData();
  } catch (error) { notify(message(error)); }
}

async function enrichAddress(place: AdminPlace) {
  if (enrichingPlaceId.value) return;
  enrichingPlaceId.value = place.id;
  try {
    await enrichAdminPlaceAddress(place.id);
    notify(`Alamat ${place.name} berhasil ditemukan. Periksa hasilnya melalui menu edit.`);
    await loadData();
  } catch (error) { notify(message(error)); }
  finally { enrichingPlaceId.value = ''; }
}

function categoryLabel(value: string) {
  return ({ medical: 'Kesehatan', education: 'Pendidikan', worship: 'Ibadah', food: 'Makanan', lodging: 'Penginapan', finance: 'Keuangan', automotive: 'Otomotif', government: 'Pemerintahan', transport: 'Transportasi', retail: 'Toko', service: 'Jasa', other: 'Lainnya' } as Record<string, string>)[value] || value;
}
function addressStatusLabel(place: AdminPlace) {
  if (place.addressVerified || place.addressSource === 'manual') return 'Diperiksa admin';
  if (place.addressSource === 'automatic') return 'Alamat otomatis';
  if (place.addressSource === 'survey') return 'Data survei';
  return 'Fallback wilayah';
}
</script>

<template>
  <main v-if="sessionLoading" class="admin-loading"><img src="/antarfix-logo-clean.png" alt="AntarFix" /><span></span><p>Menyiapkan dashboard…</p></main>

  <main v-else-if="!session" class="admin-login-page">
    <section class="admin-login-brand">
      <a href="/" class="admin-back-link"><ArrowLeft :size="16" /> Kembali ke estimator</a>
      <div class="admin-login-copy"><img src="/antarfix-logo-clean.png" alt="AntarFix" /><span class="admin-kicker">ANTARFIX CONTROL CENTER</span><h1>Kelola lokasi.<br /><em>Jaga estimasi tetap akurat.</em></h1><p>Tambahkan tempat, perbaiki alamat, dan tentukan titik koordinat dari satu dashboard.</p></div>
      <div class="admin-login-feature"><MapPinned :size="21" /><div><strong>Data langsung terhubung</strong><small>Perubahan aktif langsung tersedia untuk pencarian dan peta estimator.</small></div></div>
    </section>
    <section class="admin-login-panel">
      <form class="admin-login-card" @submit.prevent="login">
        <span class="admin-kicker">AKSES TERBATAS</span><h2>Masuk sebagai admin</h2><p>Gunakan akun administrator AntarFix.</p>
        <label>Username<input v-model="username" autocomplete="username" maxlength="100" /></label>
        <label>Password<span class="admin-password-input"><input v-model="password" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" maxlength="300" /><button type="button" :aria-label="showPassword ? 'Sembunyikan password' : 'Tampilkan password'" @click="showPassword = !showPassword"><EyeOff v-if="showPassword" :size="17" /><Eye v-else :size="17" /></button></span></label>
        <p v-if="loginError" class="admin-login-error"><CircleAlert :size="15" />{{ loginError }}</p>
        <button class="admin-login-button" :disabled="loginBusy || !username || !password">{{ loginBusy ? 'Memeriksa…' : 'Masuk ke dashboard' }}</button>
        <small class="admin-login-note">Sesi berakhir otomatis sesuai konfigurasi keamanan server.</small>
      </form>
    </section>
  </main>

  <div v-else class="admin-shell">
    <aside class="admin-sidebar" :class="{ open: sidebarOpen }">
      <div class="admin-sidebar-brand"><img src="/antarfix-logo-clean.png" alt="AntarFix" /><div><strong>AntarFix</strong><span>Admin Console</span></div><button aria-label="Tutup menu" @click="sidebarOpen = false"><X :size="18" /></button></div>
      <nav><a class="active" href="#places"><Store :size="18" />Data tempat</a><a href="/" target="_blank"><MapPinned :size="18" />Buka estimator</a></nav>
      <div class="admin-sidebar-user"><span>{{ session.username.slice(0, 1).toUpperCase() }}</span><div><strong>{{ session.username }}</strong><small>Administrator</small></div><button title="Keluar" aria-label="Keluar" @click="logout"><LogOut :size="17" /></button></div>
    </aside>
    <button v-if="sidebarOpen" class="admin-sidebar-shade" aria-label="Tutup menu" @click="sidebarOpen = false"></button>

    <div class="admin-main">
      <header class="admin-topbar"><button class="admin-mobile-menu" aria-label="Buka menu" @click="sidebarOpen = true"><Menu :size="20" /></button><div><span class="admin-kicker">DASHBOARD ADMIN</span><h1>Data tempat</h1></div><button class="admin-primary-button" @click="openAdd"><Plus :size="17" />Tambah tempat</button></header>

      <section class="admin-content" id="places">
        <div class="admin-welcome"><div><h2>Kelola titik layanan AntarFix</h2><p>Perbarui nama, alamat, kategori, dan koordinat yang digunakan pengguna.</p></div><Database :size="28" /></div>
        <div class="admin-stats-grid">
          <article><span>Total tempat</span><strong>{{ stats.total.toLocaleString('id-ID') }}</strong><small>Seluruh data tersimpan</small></article>
          <article><span>Tempat aktif</span><strong>{{ stats.active.toLocaleString('id-ID') }}</strong><small>Tampil dalam pencarian</small></article>
          <article><span>Nonaktif</span><strong>{{ stats.inactive.toLocaleString('id-ID') }}</strong><small>Disembunyikan sementara</small></article>
          <article :class="{ warning: stats.missingAddress }"><span>Alamat belum lengkap</span><strong>{{ stats.missingAddress.toLocaleString('id-ID') }}</strong><small>Perlu dilengkapi</small></article>
        </div>

        <section class="admin-table-card">
          <header class="admin-table-toolbar">
            <form class="admin-search" @submit.prevent="search"><Search :size="17" /><input v-model="query" placeholder="Cari nama, alamat, atau kata kunci" /><button>Cari</button></form>
            <div class="admin-toolbar-filters"><label class="admin-address-filter"><span>Alamat</span><select v-model="addressStatus" @change="filterAddressStatus"><option value="all">Semua status</option><option value="missing">Belum lengkap</option><option value="automatic">Otomatis</option><option value="survey">Data survei</option><option value="verified">Diperiksa admin</option></select></label><div class="admin-status-filter"><button v-for="item in [['all','Semua'],['active','Aktif'],['inactive','Nonaktif']]" :key="item[0]" :class="{ active: status === item[0] }" @click="filterStatus(item[0])">{{ item[1] }}</button></div></div>
          </header>

          <div class="admin-table-wrap">
            <table><thead><tr><th>Tempat</th><th>Kategori</th><th>Lokasi</th><th>Status</th><th><span class="sr-only">Aksi</span></th></tr></thead>
              <tbody>
                <tr v-if="dataBusy"><td colspan="5" class="admin-table-message">Memuat data tempat…</td></tr>
                <tr v-else-if="!places.length"><td colspan="5" class="admin-table-message">Belum ada tempat yang sesuai dengan pencarian.</td></tr>
                <tr v-for="place in places" v-else :key="place.id">
                  <td data-label="Tempat"><div class="admin-place-cell"><span :class="`category-${place.category}`"><Store :size="15" /></span><div><strong>{{ place.name }}</strong><small>{{ place.displayAddress }}</small><em class="admin-address-status" :class="place.addressSource">{{ addressStatusLabel(place) }}</em></div></div></td>
                  <td data-label="Kategori"><span class="admin-category-pill">{{ categoryLabel(place.category) }}</span></td>
                  <td data-label="Koordinat"><span class="admin-coordinate">{{ place.lat.toFixed(5) }}, {{ place.lng.toFixed(5) }}</span><small class="admin-updated">Diperbarui {{ new Date(place.updatedAt).toLocaleDateString('id-ID') }}</small></td>
                  <td data-label="Status"><span class="admin-status" :class="{ inactive: !place.active }"><i></i>{{ place.active ? 'Aktif' : 'Nonaktif' }}</span></td>
                  <td class="admin-row-actions"><button v-if="place.addressSource === 'missing'" title="Cari alamat otomatis" :disabled="!!enrichingPlaceId" @click="enrichAddress(place)"><LoaderCircle v-if="enrichingPlaceId === place.id" :size="16" class="spin" /><WandSparkles v-else :size="16" /></button><button title="Edit tempat" @click="openEdit(place)"><Edit3 :size="16" /></button><button :title="place.active ? 'Nonaktifkan' : 'Aktifkan'" @click="togglePlace(place)"><EyeOff v-if="place.active" :size="16" /><Eye v-else :size="16" /></button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <footer class="admin-table-footer"><span>{{ rangeLabel }}</span><div><button :disabled="page <= 1 || dataBusy" @click="changePage(page - 1)"><ChevronLeft :size="17" /></button><strong>Halaman {{ page }} / {{ totalPages }}</strong><button :disabled="page >= totalPages || dataBusy" @click="changePage(page + 1)"><ChevronRight :size="17" /></button></div></footer>
        </section>
      </section>
    </div>

    <AdminPlaceForm v-if="formOpen" :place="editingPlace" :center="serviceCenter" :saving="saving" :server-error="formError" @close="formOpen = false" @save="savePlace" />
    <Transition name="admin-toast"><div v-if="toast" class="admin-toast">{{ toast }}</div></Transition>
  </div>
</template>
