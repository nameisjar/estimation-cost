<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Check, LoaderCircle, MapPin, WandSparkles, X } from 'lucide-vue-next';
import AdminPlaceMap from './AdminPlaceMap.vue';
import { reverseAdminAddress, type AdminPlace, type AdminPlaceInput } from '../../services/admin.service';

const props = defineProps<{ place: AdminPlace | null; center: { lat: number; lng: number }; saving: boolean; serverError: string }>();
const emit = defineEmits<{ close: []; save: [value: AdminPlaceInput] }>();
const categories = [
  ['medical', 'Kesehatan'], ['education', 'Pendidikan'], ['worship', 'Tempat ibadah'],
  ['food', 'Makanan & minuman'], ['lodging', 'Penginapan'], ['finance', 'Bank & keuangan'],
  ['automotive', 'Otomotif'], ['government', 'Pemerintahan'], ['transport', 'Transportasi'],
  ['retail', 'Toko & belanja'], ['service', 'Jasa'], ['other', 'Lainnya'],
];
const form = reactive({
  name: '', category: 'other', address: '', lat: props.center.lat, lng: props.center.lng,
  rating: '' as number | '', reviewCount: '' as number | '', phone: '', website: '',
  openingHours: '', googleMapsUrl: '', searchKeyword: '', searchArea: 'Merauke', active: true,
});
const addressLookupBusy = ref(false);
const addressLookupMessage = ref('');
const addressLookupError = ref(false);
let addressLookupTimer: ReturnType<typeof setTimeout> | undefined;
const localError = computed(() => {
  if (form.name.trim().length < 2) return 'Nama tempat minimal 2 karakter.';
  if (!Number.isFinite(Number(form.lat)) || Math.abs(Number(form.lat)) > 90) return 'Latitude tidak valid.';
  if (!Number.isFinite(Number(form.lng)) || Math.abs(Number(form.lng)) > 180) return 'Longitude tidak valid.';
  return '';
});

function fill(place: AdminPlace | null) {
  Object.assign(form, place ? {
    name: place.name,
    category: place.category,
    address: place.addressSource === 'missing' ? '' : place.address,
    lat: place.lat, lng: place.lng, rating: place.rating ?? '', reviewCount: place.reviewCount ?? '',
    phone: place.phone ?? '', website: place.website ?? '', openingHours: place.openingHours ?? '',
    googleMapsUrl: place.googleMapsUrl ?? '', searchKeyword: place.searchKeyword ?? '',
    searchArea: place.searchArea ?? 'Merauke', active: place.active,
  } : {
    name: '', category: 'other', address: '', lat: props.center.lat, lng: props.center.lng,
    rating: '', reviewCount: '', phone: '', website: '', openingHours: '', googleMapsUrl: '',
    searchKeyword: '', searchArea: 'Merauke', active: true,
  });
  addressLookupMessage.value = '';
  addressLookupError.value = false;
}
watch(() => props.place, fill, { immediate: true });

async function lookupAddress() {
  if (addressLookupBusy.value || !Number.isFinite(Number(form.lat)) || !Number.isFinite(Number(form.lng))) return;
  addressLookupBusy.value = true;
  addressLookupMessage.value = 'Mencari alamat dari koordinat…';
  addressLookupError.value = false;
  try {
    const result = await reverseAdminAddress(Number(form.lat), Number(form.lng));
    form.address = result.address;
    addressLookupMessage.value = 'Alamat ditemukan otomatis. Periksa sebelum menyimpan.';
  } catch (error) {
    addressLookupError.value = true;
    addressLookupMessage.value = error instanceof Error ? error.message : 'Alamat belum berhasil ditemukan.';
  } finally { addressLookupBusy.value = false; }
}

function changeMapPoint(point: { lat: number; lng: number }) {
  form.lat = point.lat;
  form.lng = point.lng;
  if (addressLookupTimer) clearTimeout(addressLookupTimer);
  if (!form.address.trim()) addressLookupTimer = setTimeout(() => { void lookupAddress(); }, 550);
}
onBeforeUnmount(() => { if (addressLookupTimer) clearTimeout(addressLookupTimer); });

function submit() {
  if (localError.value || props.saving) return;
  emit('save', {
    name: form.name.trim(), category: form.category, address: form.address.trim(),
    lat: Number(form.lat), lng: Number(form.lng),
    rating: form.rating === '' ? null : Number(form.rating),
    reviewCount: form.reviewCount === '' ? null : Number(form.reviewCount),
    phone: form.phone.trim() || null, website: form.website.trim() || null,
    openingHours: form.openingHours.trim() || null, googleMapsUrl: form.googleMapsUrl.trim() || null,
    searchKeyword: form.searchKeyword.trim() || null, searchArea: form.searchArea.trim() || null,
    active: form.active,
  });
}
</script>

<template>
  <div class="admin-drawer-backdrop" @click.self="emit('close')">
    <aside class="admin-drawer" aria-modal="true" role="dialog" :aria-label="place ? 'Edit tempat' : 'Tambah tempat'">
      <header class="admin-drawer-header">
        <div><span class="admin-kicker">DATA TEMPAT</span><h2>{{ place ? 'Edit tempat' : 'Tambah tempat baru' }}</h2><p>Isi data utama, lalu pastikan pin berada di titik yang tepat.</p></div>
        <button type="button" class="admin-icon-button" aria-label="Tutup" @click="emit('close')"><X :size="19" /></button>
      </header>
      <form class="admin-place-form" @submit.prevent="submit">
        <section class="admin-form-section">
          <div class="admin-section-heading"><span>1</span><div><strong>Informasi utama</strong><small>Nama, kategori, dan alamat yang dilihat pengguna.</small></div></div>
          <div class="admin-form-grid">
            <label class="wide">Nama tempat <b>*</b><input v-model="form.name" maxlength="160" placeholder="Contoh: Warung Mie Ayam Mandala" /></label>
            <label>Kategori <b>*</b><select v-model="form.category"><option v-for="item in categories" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select></label>
            <label>Area pencarian<input v-model="form.searchArea" maxlength="160" placeholder="Merauke" /></label>
            <label class="wide"><span class="admin-field-title">Alamat<button type="button" class="admin-address-lookup" :disabled="addressLookupBusy" @click="lookupAddress"><LoaderCircle v-if="addressLookupBusy" :size="13" class="spin" /><WandSparkles v-else :size="13" />{{ addressLookupBusy ? 'Mencari…' : 'Isi dari koordinat' }}</button></span><textarea v-model="form.address" rows="2" maxlength="500" placeholder="Nama jalan, kelurahan, distrik" /><small v-if="addressLookupMessage" class="admin-address-lookup-message" :class="{ error: addressLookupError }">{{ addressLookupMessage }}</small></label>
            <label>Kata kunci<input v-model="form.searchKeyword" maxlength="160" placeholder="bakso, klinik, sekolah" /></label>
            <label class="admin-switch-label"><span>Status tempat</span><button type="button" class="admin-switch" :class="{ on: form.active }" @click="form.active = !form.active"><i></i>{{ form.active ? 'Aktif' : 'Nonaktif' }}</button></label>
          </div>
        </section>

        <section class="admin-form-section">
          <div class="admin-section-heading"><span>2</span><div><strong>Koordinat peta</strong><small>Klik peta atau geser marker untuk menentukan posisi.</small></div></div>
          <AdminPlaceMap :lat="Number(form.lat)" :lng="Number(form.lng)" @change="changeMapPoint" />
          <div class="admin-coordinate-grid">
            <label>Latitude <b>*</b><input v-model.number="form.lat" type="number" step="any" /></label>
            <label>Longitude <b>*</b><input v-model.number="form.lng" type="number" step="any" /></label>
          </div>
          <p class="admin-map-help"><MapPin :size="14" /> Koordinat dipakai untuk pencarian, label peta, dan titik perjalanan.</p>
        </section>

        <section class="admin-form-section">
          <div class="admin-section-heading"><span>3</span><div><strong>Informasi tambahan</strong><small>Semua bagian ini bersifat opsional.</small></div></div>
          <div class="admin-form-grid">
            <label>Telepon<input v-model="form.phone" maxlength="40" placeholder="62812..." /></label>
            <label>Jam operasional<input v-model="form.openingHours" maxlength="500" placeholder="Senin–Sabtu 08.00–20.00" /></label>
            <label>Website<input v-model="form.website" type="url" maxlength="1000" placeholder="https://..." /></label>
            <label>Google Maps URL<input v-model="form.googleMapsUrl" type="url" maxlength="1000" placeholder="https://maps.google.com/..." /></label>
            <label>Rating<input v-model.number="form.rating" type="number" min="0" max="5" step="0.1" placeholder="4.5" /></label>
            <label>Jumlah ulasan<input v-model.number="form.reviewCount" type="number" min="0" step="1" placeholder="0" /></label>
          </div>
        </section>

        <p v-if="localError || serverError" class="admin-form-error">{{ localError || serverError }}</p>
        <footer class="admin-drawer-footer"><button type="button" class="admin-secondary-button" @click="emit('close')">Batal</button><button type="submit" class="admin-primary-button" :disabled="!!localError || saving"><Check :size="17" />{{ saving ? 'Menyimpan…' : 'Simpan tempat' }}</button></footer>
      </form>
    </aside>
  </div>
</template>
