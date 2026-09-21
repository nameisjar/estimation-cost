<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  CheckCircle2, CircleAlert, Download, FileSpreadsheet, LoaderCircle, Upload, X,
} from 'lucide-vue-next';
import {
  importAdminPlacesCsv,
  previewAdminPlacesCsv,
  type PlaceCsvImportMode,
  type PlaceCsvImportResult,
  type PlaceCsvPreview,
} from '../../services/admin.service';

const emit = defineEmits<{
  close: [];
  imported: [result: PlaceCsvImportResult];
}>();

const fileInput = ref<HTMLInputElement>();
const fileName = ref('');
const csvText = ref('');
const mode = ref<PlaceCsvImportMode>('upsert');
const preview = ref<PlaceCsvPreview | null>(null);
const busy = ref(false);
const committing = ref(false);
const error = ref('');

const canCommit = computed(() => !!preview.value?.validRows && !busy.value && !committing.value);

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : 'CSV belum dapat diproses.';
}

function download(name: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadTemplate() {
  download(
    'template-tempat-antarfix.csv',
    [
      'placeId,name,category,address,latitude,longitude,rating,reviewCount,phone,website,openingHours,googleMapsUrl,searchKeyword,searchArea,collectedAt',
      'contoh-001,Toko Contoh,retail,Jalan Contoh Merauke,-8.4932,140.4018,4.5,10,,,,,toko,Merauke,2026-09-20',
    ].join('\n'),
  );
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadReport() {
  if (!preview.value) return;
  const entries = [
    ...preview.value.issues.map(item => ({ type: 'tidak_dapat_diperbaiki', ...item })),
    ...preview.value.corrections.map(item => ({ type: 'koordinat_diperbaiki', ...item })),
    ...preview.value.merges.map(item => ({ type: 'duplikat_digabung', ...item })),
    ...preview.value.warnings.map(item => ({ type: 'di_luar_area_layanan', ...item })),
  ];
  download(
    'laporan-impor-csv.csv',
    ['type,row,name,message', ...entries.map(item => [item.type, item.row, item.name, item.message].map(csvCell).join(','))].join('\n'),
  );
}

async function createPreview() {
  if (!csvText.value) return;
  busy.value = true;
  error.value = '';
  preview.value = null;
  try {
    preview.value = await previewAdminPlacesCsv(csvText.value, mode.value);
  } catch (value) {
    error.value = errorMessage(value);
  } finally {
    busy.value = false;
  }
}

async function chooseFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  error.value = '';
  preview.value = null;
  if (!file.name.toLocaleLowerCase('id').endsWith('.csv')) {
    error.value = 'Pilih file dengan ekstensi .csv.';
    return;
  }
  if (!file.size) {
    error.value = 'File CSV kosong.';
    return;
  }
  fileName.value = file.name;
  csvText.value = await file.text();
  await createPreview();
}

function changeMode() {
  preview.value = null;
  if (csvText.value) void createPreview();
}

async function commit() {
  if (!canCommit.value) return;
  committing.value = true;
  error.value = '';
  try {
    const result = await importAdminPlacesCsv(csvText.value, mode.value);
    emit('imported', result);
  } catch (value) {
    error.value = errorMessage(value);
  } finally {
    committing.value = false;
  }
}
</script>

<template>
  <div class="admin-import-backdrop" role="presentation" @mousedown.self="!committing && emit('close')">
    <section class="admin-import-dialog" role="dialog" aria-modal="true" aria-labelledby="csv-import-title">
      <header>
        <div class="admin-import-heading"><span><FileSpreadsheet :size="21" /></span><div><small>IMPORT DATA TEMPAT</small><h2 id="csv-import-title">Impor CSV</h2><p>Periksa perubahan sebelum menyimpannya ke database.</p></div></div>
        <button class="admin-icon-button" :disabled="committing" aria-label="Tutup" @click="emit('close')"><X :size="18" /></button>
      </header>

      <div class="admin-import-body">
        <div class="admin-import-options">
          <label>Mode impor<select v-model="mode" :disabled="busy || committing" @change="changeMode"><option value="upsert">Tambah dan perbarui data</option><option value="insert-only">Hanya tambah data baru</option></select></label>
          <button class="admin-secondary-button" type="button" @click="downloadTemplate"><Download :size="15" />Unduh template</button>
        </div>

        <button class="admin-import-dropzone" type="button" :disabled="busy || committing" @click="fileInput?.click()">
          <input ref="fileInput" class="sr-only" type="file" accept=".csv,text/csv" @change="chooseFile" />
          <LoaderCircle v-if="busy" :size="30" class="spin" />
          <Upload v-else :size="30" />
          <strong>{{ busy ? 'Memeriksa CSV…' : fileName || 'Pilih file CSV' }}</strong>
          <small>Tidak ada batas ukuran atau jumlah baris. File belum disimpan sebelum dikonfirmasi.</small>
        </button>

        <p v-if="error" class="admin-import-error"><CircleAlert :size="16" />{{ error }}</p>

        <template v-if="preview">
          <div class="admin-import-summary">
            <article><span>Total baris</span><strong>{{ preview.totalRows.toLocaleString('id-ID') }}</strong></article>
            <article class="success"><span>Data baru</span><strong>{{ preview.newRows.toLocaleString('id-ID') }}</strong></article>
            <article class="update"><span>Akan diperbarui</span><strong>{{ preview.updateRows.toLocaleString('id-ID') }}</strong></article>
            <article :class="{ warning: preview.skippedRows }"><span>Dilewati</span><strong>{{ preview.skippedRows.toLocaleString('id-ID') }}</strong></article>
            <article class="repaired"><span>Koordinat diperbaiki</span><strong>{{ preview.correctedRows.toLocaleString('id-ID') }}</strong></article>
            <article class="merged"><span>Duplikat digabung</span><strong>{{ preview.mergedRows.toLocaleString('id-ID') }}</strong></article>
          </div>

          <div v-if="preview.correctedRows || preview.mergedRows" class="admin-import-adjustments">
            <div><span><CheckCircle2 :size="15" />Perbaikan otomatis</span><button type="button" @click="downloadReport"><Download :size="13" />Unduh laporan lengkap</button></div>
            <p>Perubahan berikut sudah diterapkan pada data yang akan diimpor dan tidak memerlukan penyuntingan manual.</p>
            <ul>
              <li v-for="item in preview.corrections" :key="`correction-${item.row}-${item.message}`"><strong>Diperbaiki &middot; Baris {{ item.row }} &middot; {{ item.name }}</strong><span>{{ item.message }}</span></li>
              <li v-for="item in preview.merges" :key="`merge-${item.row}-${item.message}`"><strong>Digabung &middot; Baris {{ item.row }} &middot; {{ item.name }}</strong><span>{{ item.message }}</span></li>
            </ul>
            <small v-if="preview.correctedRows + preview.mergedRows > preview.corrections.length + preview.merges.length">Menampilkan {{ preview.corrections.length + preview.merges.length }} dari {{ preview.correctedRows + preview.mergedRows }} penyesuaian.</small>
          </div>

          <div v-if="preview.issues.length" class="admin-import-issues">
            <div><span><CircleAlert :size="15" />Tidak dapat diperbaiki</span><button type="button" @click="downloadReport"><Download :size="13" />Unduh laporan lengkap</button></div>
            <ul><li v-for="issue in preview.issues" :key="`${issue.row}-${issue.message}`"><strong>Baris {{ issue.row }} &middot; {{ issue.name }}</strong><span>{{ issue.message }}</span></li></ul>
            <small v-if="preview.invalidRows > preview.issues.length">Menampilkan {{ preview.issues.length }} dari {{ preview.invalidRows }} masalah.</small>
          </div>

          <div v-if="preview.outsideServiceRows" class="admin-import-warnings">
            <div><span><CircleAlert :size="15" />{{ preview.outsideServiceRows.toLocaleString('id-ID') }} lokasi di luar area layanan</span></div>
            <p>Data tetap akan disimpan. Lokasi tersebut belum digunakan untuk pemesanan selama berada di luar cakupan layanan.</p>
            <ul><li v-for="warning in preview.warnings" :key="`${warning.row}-${warning.message}`"><strong>Baris {{ warning.row }} &middot; {{ warning.name }}</strong><span>{{ warning.message }}</span></li></ul>
            <small v-if="preview.outsideServiceRows > preview.warnings.length">Menampilkan {{ preview.warnings.length }} dari {{ preview.outsideServiceRows }} peringatan.</small>
          </div>

          <p v-if="!preview.issues.length && !preview.outsideServiceRows" class="admin-import-ready"><CheckCircle2 :size="16" />Semua baris CSV valid dan berada di dalam area layanan.</p>
        </template>
      </div>

      <footer>
        <p v-if="preview">{{ preview.validRows.toLocaleString('id-ID') }} tempat akan diproses dari {{ (preview.totalRows - preview.invalidRows).toLocaleString('id-ID') }} baris yang diterima.</p>
        <span></span>
        <button class="admin-secondary-button" :disabled="committing" @click="emit('close')">Batal</button>
        <button class="admin-primary-button" :disabled="!canCommit" @click="commit"><LoaderCircle v-if="committing" :size="15" class="spin" /><Upload v-else :size="15" />{{ committing ? 'Mengimpor…' : 'Konfirmasi impor' }}</button>
      </footer>
    </section>
  </div>
</template>
