<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  ChevronDown,
  Clock3,
  Info,
  LoaderCircle,
  MapPin,
  MessageCircle,
  MousePointer2,
  Package,
  RotateCcw,
  Route,
  Search,
  X,
} from "lucide-vue-next";
import EstimatorMap from "./components/EstimatorMap.vue";
import {
  estimateCost,
  getConfig,
  isValidPoint,
  reverseGeocode,
  searchPlaces,
} from "./services/estimate.service";
import {
  formatCurrency,
  formatDistance,
  formatDuration,
  formatPoint,
  whatsappUrl,
} from "./utils/format";
import { locationWithFallback } from "./utils/location-label";
import type {
  LocationPoint,
  Selection,
  UiState,
  Estimate,
  AppConfig,
  GeocodedPlace,
} from "./types";

const pickup = ref<LocationPoint | null>(null);
const destination = ref<LocationPoint | null>(null);
const selection = ref<Selection | null>(null);
const state = ref<UiState>("idle");
const estimate = ref<Estimate | null>(null);
const settings = ref<AppConfig | null>(null);
const error = ref("");
const showHelp = ref(false);
const mapRegion = ref<HTMLElement>();
const resultRegion = ref<HTMLElement>();
const locationRegion = ref<HTMLElement>();
const mapComponent = ref<InstanceType<typeof EstimatorMap>>();
const manualDetails = ref<HTMLDetailsElement>();
const manualOpen = ref(false);
const manualTarget = ref<Selection>("pickup");
const manualLat = ref("");
const manualLng = ref("");
const manualError = ref("");
const pickupPlace = ref<GeocodedPlace | null>(null);
const destinationPlace = ref<GeocodedPlace | null>(null);
const deviceLocation = ref<LocationPoint | null>(null);
const centerPreviewTarget = ref<Selection | null>(null);
const centerPreviewPlace = ref<GeocodedPlace | null>(null);
const centerPreviewPoint = ref<LocationPoint | null>(null);
const resolvingCenterPreview = ref(false);
const resolvingPlace = ref<Record<Selection, boolean>>({
  pickup: false,
  destination: false,
});
const searchTarget = ref<Selection>("pickup");
const searchQuery = ref("");
const searchResults = ref<GeocodedPlace[]>([]);
const searchBusy = ref(false);
const searchError = ref("");
const showPlacePicker = ref(false);
const locatingInitialPickup = ref(false);
const placePicker = ref<HTMLElement>();
const geocodeVersion: Record<Selection, number> = { pickup: 0, destination: 0 };
let searchVersion = 0;
let centerPreviewVersion = 0;
let centerPreviewTimer: ReturnType<typeof setTimeout> | undefined;

const busy = computed(() => state.value === "calculating");
const ready = computed(() => !!pickup.value && !!destination.value && !busy.value);
const selectedCount = computed(
  () => Number(!!pickup.value) + Number(!!destination.value)
);
const showMobileAction = computed(
  () => !estimate.value && !manualOpen.value && !showPlacePicker.value
);
const actionLabel = computed(() =>
  busy.value
    ? "Menghitung rute..."
    : locatingInitialPickup.value
    ? "Mencari lokasi Anda..."
    : selection.value === "pickup"
    ? "Gunakan titik jemput ini"
    : selection.value === "destination"
    ? "Gunakan titik tujuan ini"
    : !pickup.value
    ? "Pilih titik jemput"
    : !destination.value
    ? "Pilih titik tujuan"
    : error.value
    ? "Hitung ulang estimasi"
    : "Hitung estimasi"
);
const mobileActionHint = computed(() =>
  busy.value
    ? "Perjalananmu sedang dihitung"
    : selection.value === "pickup"
    ? "Geser peta sampai pin A tepat"
    : selection.value === "destination"
    ? "Geser peta sampai pin B tepat"
    : ready.value
    ? "Siap cek biaya pengiriman?"
    : "Pilih lokasi, lalu cek biayanya"
);
const pickupDisplayName = computed(() => {
  if (locatingInitialPickup.value) return "Mencari lokasi Anda…";
  if (selection.value === "pickup") {
    if (resolvingCenterPreview.value) return "Mencari nama lokasi…";
    if (centerPreviewTarget.value === "pickup" && centerPreviewPlace.value)
      return centerPreviewPlace.value.name;
    return centerPreviewPoint.value
      ? "Titik jemput di peta"
      : "Geser peta untuk memilih jemput";
  }
  return (
    pickupPlace.value?.name ||
    (resolvingPlace.value.pickup
      ? "Mencari nama lokasi…"
      : pickup.value
      ? "Titik jemput pilihan"
      : "Pilih titik jemput")
  );
});
const pickupDisplayAddress = computed(() => {
  if (locatingInitialPickup.value) return "Izinkan akses lokasi pada browser";
  if (selection.value === "pickup") {
    if (centerPreviewTarget.value === "pickup" && centerPreviewPlace.value)
      return centerPreviewPlace.value.address;
    if (centerPreviewPoint.value) return formatPoint(centerPreviewPoint.value);
    return "Nama tempat akan muncul setelah peta berhenti";
  }
  return (
    pickupPlace.value?.address ||
    (pickup.value ? formatPoint(pickup.value) : "Cari tempat atau pilih di peta")
  );
});
const destinationDisplayName = computed(() => {
  if (selection.value === "destination") {
    if (resolvingCenterPreview.value) return "Mencari nama lokasi…";
    if (centerPreviewTarget.value === "destination" && centerPreviewPlace.value)
      return centerPreviewPlace.value.name;
    return centerPreviewPoint.value
      ? "Titik tujuan di peta"
      : "Geser peta untuk memilih tujuan";
  }
  return (
    destinationPlace.value?.name ||
    (resolvingPlace.value.destination
      ? "Mencari nama lokasi…"
      : destination.value
      ? "Titik tujuan pilihan"
      : "Pilih titik tujuan")
  );
});
const destinationDisplayAddress = computed(() => {
  if (selection.value === "destination") {
    if (centerPreviewTarget.value === "destination" && centerPreviewPlace.value)
      return centerPreviewPlace.value.address;
    if (centerPreviewPoint.value) return formatPoint(centerPreviewPoint.value);
    return "Nama tempat akan muncul setelah peta berhenti";
  }
  return (
    destinationPlace.value?.address ||
    (destination.value
      ? formatPoint(destination.value)
      : "Cari tempat atau pilih di peta")
  );
});
const bookingUrl = computed(() =>
  estimate.value && settings.value && pickup.value && destination.value
    ? whatsappUrl(
        settings.value.whatsappNumber,
        {
          pickup: pickup.value,
          destination: destination.value,
          pickupPlace: pickupPlace.value,
          destinationPlace: destinationPlace.value,
          distanceKm: estimate.value.distanceKm,
          durationMinutes: estimate.value.durationMinutes,
          total: estimate.value.pricing.total,
        }
      )
    : null
);

async function reveal(element: HTMLElement | undefined, focus = false) {
  await nextTick();
  if (!element || !window.matchMedia("(max-width: 800px)").matches) return;
  if (focus) element.focus({ preventScroll: true });
  element.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
    block: "start",
  });
}

async function loadConfig() {
  try {
    settings.value = await getConfig();
  } catch {
    settings.value = null;
  }
}

async function initializeApp() {
  void loadConfig();
  await nextTick();
  if (pickup.value || !mapComponent.value) return;

  locatingInitialPickup.value = true;
  startSelection("pickup", false);
  try {
    await mapComponent.value.locateForSelection("pickup");
  } finally {
    locatingInitialPickup.value = false;
  }
}

onMounted(initializeApp);

function startSelection(target: Selection, revealMap = true) {
  if (busy.value) return;
  clearCenterPreview();
  selection.value = target;
  manualTarget.value = target;
  searchTarget.value = target;
  state.value = target === "pickup" ? "selecting-pickup" : "selecting-destination";
  manualLat.value = "";
  manualLng.value = "";
  manualError.value = "";
  error.value = "";
  estimate.value = null;
  if (revealMap) void reveal(mapRegion.value, true);
}

async function openPlacePicker(target: Selection) {
  if (busy.value) return;
  searchTarget.value = target;
  manualTarget.value = target;
  searchQuery.value = "";
  searchResults.value = [];
  searchError.value = "";
  searchBusy.value = false;
  manualLat.value = "";
  manualLng.value = "";
  manualError.value = "";
  showPlacePicker.value = true;
  await nextTick();
  placePicker.value?.focus({ preventScroll: true });
}

function closePlacePicker() {
  searchVersion++;
  showPlacePicker.value = false;
  searchResults.value = [];
  searchError.value = "";
  searchBusy.value = false;
  manualOpen.value = false;
  if (manualDetails.value) manualDetails.value.open = false;
}

async function pickOnMap() {
  const target = searchTarget.value;
  closePlacePicker();
  startSelection(target);
  await nextTick();
  void mapComponent.value?.beginSelection(target);
}

function setPlace(target: Selection, place: GeocodedPlace | null) {
  const normalizedPlace = locationWithFallback(place, target);
  if (target === "pickup") pickupPlace.value = normalizedPlace;
  else destinationPlace.value = normalizedPlace;
}

async function resolvePlace(point: LocationPoint, target: Selection, version: number) {
  resolvingPlace.value[target] = true;
  try {
    const place = await reverseGeocode(point);
    if (geocodeVersion[target] === version) setPlace(target, place);
  } catch {
    if (geocodeVersion[target] === version) setPlace(target, null);
  } finally {
    if (geocodeVersion[target] === version) resolvingPlace.value[target] = false;
  }
}

function clearCenterPreview() {
  centerPreviewVersion++;
  if (centerPreviewTimer) clearTimeout(centerPreviewTimer);
  centerPreviewTimer = undefined;
  centerPreviewTarget.value = null;
  centerPreviewPoint.value = null;
  centerPreviewPlace.value = null;
  resolvingCenterPreview.value = false;
}

function startCenterPreview(target: Selection) {
  if (selection.value !== target) return;
  centerPreviewVersion++;
  if (centerPreviewTimer) clearTimeout(centerPreviewTimer);
  centerPreviewTimer = undefined;
  centerPreviewTarget.value = target;
  centerPreviewPlace.value = null;
  resolvingCenterPreview.value = true;
}

function previewCenter(point: LocationPoint, target: Selection) {
  if (selection.value !== target || !isValidPoint(point)) return;
  const version = ++centerPreviewVersion;
  if (centerPreviewTimer) clearTimeout(centerPreviewTimer);
  centerPreviewTarget.value = target;
  centerPreviewPoint.value = point;
  centerPreviewPlace.value = null;
  resolvingCenterPreview.value = true;
  centerPreviewTimer = setTimeout(async () => {
    try {
      const place = await reverseGeocode(point);
      if (centerPreviewVersion === version && selection.value === target)
        centerPreviewPlace.value = locationWithFallback(place, target);
    } catch {
      if (centerPreviewVersion === version) centerPreviewPlace.value = null;
    } finally {
      if (centerPreviewVersion === version) resolvingCenterPreview.value = false;
    }
  }, 450);
}

function pointsMatch(a: LocationPoint | null, b: LocationPoint) {
  return !!a && Math.abs(a.lat - b.lat) < 0.000001 && Math.abs(a.lng - b.lng) < 0.000001;
}

function choose(point: LocationPoint, target: Selection, knownPlace?: GeocodedPlace) {
  if (busy.value || !isValidPoint(point)) return;
  const previewPlace =
    centerPreviewTarget.value === target && pointsMatch(centerPreviewPoint.value, point)
      ? centerPreviewPlace.value || undefined
      : undefined;
  const selectedPlace = knownPlace || previewPlace;
  if (target === "pickup") pickup.value = point;
  else destination.value = point;
  const version = ++geocodeVersion[target];
  setPlace(target, selectedPlace || null);
  resolvingPlace.value[target] = false;
  if (!selectedPlace) void resolvePlace(point, target, version);
  clearCenterPreview();
  estimate.value = null;
  error.value = "";
  manualError.value = "";
  // Keep the map still when moving from A to B, including when dragging markers.
  if (target === "pickup" && !destination.value) startSelection("destination", false);
  else if (target === "destination" && !pickup.value) startSelection("pickup", false);
  else {
    selection.value = null;
    state.value = "idle";
  }
}

async function submitPlaceSearch() {
  const query = searchQuery.value.trim();
  const version = ++searchVersion;
  searchError.value = "";
  searchResults.value = [];
  if (query.length < 3) {
    searchError.value = "Masukkan minimal 3 karakter.";
    return;
  }
  searchBusy.value = true;
  try {
    const searchFocus = searchTarget.value === "destination"
      ? pickup.value || deviceLocation.value
      : deviceLocation.value || pickup.value;
    const results = await searchPlaces(query, searchFocus);
    if (searchVersion !== version) return;
    searchResults.value = results;
    if (!searchResults.value.length)
      searchError.value =
        "Tempat belum ditemukan. Coba nama atau alamat yang lebih lengkap.";
  } catch (failure) {
    if (searchVersion !== version) return;
    searchError.value =
      failure instanceof Error ? failure.message : "Pencarian lokasi belum berhasil.";
  } finally {
    if (searchVersion === version) searchBusy.value = false;
  }
}

async function selectSearchResult(place: GeocodedPlace) {
  const target = searchTarget.value;
  choose({ lat: place.lat, lng: place.lng }, target, place);
  searchResults.value = [];
  searchQuery.value = "";
  searchError.value = "";
  closePlacePicker();
  await nextTick();
  mapComponent.value?.fitMap();
  await reveal(mapRegion.value, true);
}

function toggleManual(event: Event) {
  manualOpen.value = (event.target as HTMLDetailsElement).open;
}

async function setManual() {
  if (busy.value) return;
  manualTarget.value = searchTarget.value;
  const point = { lat: Number(manualLat.value), lng: Number(manualLng.value) };
  if (!manualLat.value.trim() || !manualLng.value.trim() || !isValidPoint(point)) {
    manualError.value = "Masukkan latitude (-90–90) dan longitude (-180–180) yang valid.";
    return;
  }
  choose(point, manualTarget.value);
  if (manualDetails.value) manualDetails.value.open = false;
  manualOpen.value = false;
  showPlacePicker.value = false;
  await nextTick();
  mapComponent.value?.fitMap();
  await reveal(mapRegion.value, true);
}

async function swapPoints() {
  if (busy.value || selection.value || !pickup.value || !destination.value) return;
  const shouldRecalculate = !!estimate.value;
  clearCenterPreview();
  [pickup.value, destination.value] = [destination.value, pickup.value];
  [pickupPlace.value, destinationPlace.value] = [
    destinationPlace.value,
    pickupPlace.value,
  ];
  geocodeVersion.pickup++;
  geocodeVersion.destination++;
  resolvingPlace.value = { pickup: false, destination: false };
  estimate.value = null;
  error.value = "";
  selection.value = null;
  state.value = "idle";
  await nextTick();
  mapComponent.value?.fitMap();
  if (shouldRecalculate) await calculate();
}

function reset() {
  if (busy.value) return;
  clearCenterPreview();
  pickup.value = null;
  destination.value = null;
  estimate.value = null;
  pickupPlace.value = null;
  destinationPlace.value = null;
  geocodeVersion.pickup++;
  geocodeVersion.destination++;
  resolvingPlace.value = { pickup: false, destination: false };
  selection.value = null;
  error.value = "";
  state.value = "idle";
  manualLat.value = "";
  manualLng.value = "";
  manualError.value = "";
  manualTarget.value = "pickup";
  searchTarget.value = "pickup";
  searchQuery.value = "";
  searchResults.value = [];
  searchError.value = "";
  searchBusy.value = false;
  showPlacePicker.value = false;
  if (manualDetails.value) manualDetails.value.open = false;
  manualOpen.value = false;
  void reveal(locationRegion.value, true);
}

async function calculate() {
  if (!ready.value || !pickup.value || !destination.value) return;
  const a = { ...pickup.value };
  const b = { ...destination.value };
  state.value = "calculating";
  selection.value = null;
  estimate.value = null;
  error.value = "";
  await nextTick();
  void reveal(resultRegion.value, true);
  try {
    estimate.value = await estimateCost(a, b);
    state.value = "success";
    await reveal(resultRegion.value, true);
    if (!settings.value) void loadConfig();
  } catch (failure) {
    error.value =
      failure instanceof Error
        ? failure.message
        : "Perhitungan belum berhasil. Silakan coba lagi.";
    state.value = "error";
    await reveal(resultRegion.value, true);
  }
}

function mobileAction() {
  if (busy.value) return;
  if (selection.value) confirmMapSelection();
  else if (!pickup.value) void openPlacePicker("pickup");
  else if (!destination.value) void openPlacePicker("destination");
  else void calculate();
}

function confirmMapSelection() {
  mapComponent.value?.confirmCenterSelection();
}

onBeforeUnmount(clearCenterPreview);
</script>

<template>
  <div class="site-shell" :class="{ 'with-mobile-action': showMobileAction }">
    <header class="site-header">
      <a class="brand" href="/" aria-label="AntarFix Estimator beranda">
        <img
          class="brand-logo"
          src="/antarfix-logo-clean.png"
          alt="AntarFix"
          width="82"
          height="64"
        />
        <span class="brand-product">Estimator</span>
      </a>
      <button
        class="help-link"
        :aria-expanded="showHelp"
        aria-controls="help-panel"
        @click="showHelp = !showHelp"
      >
        <span class="help-full">Cara menggunakan</span
        ><span class="help-short">Panduan</span><Info :size="17" />
      </button>
    </header>

    <main>
      <section
        v-if="showHelp"
        id="help-panel"
        class="help-panel"
        aria-label="Cara menggunakan"
      >
        <div>
          <strong>Tiga langkah, satu estimasi.</strong>
          <p>
            Cari nama tempat atau pilih langsung di peta. Peta akan mencoba memakai lokasi
            perangkat sebagai titik awal. Tekan Hitung estimasi setelah A dan B dipilih;
            marker tetap bisa digeser untuk memperbaiki lokasi.
          </p>
        </div>
        <button class="text-button" @click="showHelp = false">Tutup</button>
      </section>

      <div class="estimator-layout">
        <div class="estimator-sidebar">
          <section
            ref="locationRegion"
            class="location-card"
            tabindex="-1"
            aria-labelledby="location-title"
          >
            <div class="card-title">
              <h2 id="location-title">Mau kirim ke mana?</h2>
              <span class="location-count">{{ selectedCount }}/2 titik</span>
            </div>
            <p class="card-subtitle">Cari nama tempat atau pilih langsung dari peta.</p>
            <div class="location-fields">
              <div class="point-connector" />
              <div class="location-row">
                <span class="point-badge point-a">A</span>
                <div class="location-content">
                  <label for="pickup-button">Lokasi penjemputan</label>
                  <button
                    id="pickup-button"
                    class="location-button"
                    :class="{ selected: pickup, active: selection === 'pickup' }"
                    :disabled="busy"
                    :aria-pressed="selection === 'pickup'"
                    @click="openPlacePicker('pickup')"
                  >
                    <span
                      ><strong>{{ pickupDisplayName }}</strong
                      ><small>{{ pickupDisplayAddress }}</small></span
                    >
                  </button>
                </div>
              </div>
              <div class="swap-row">
                <button
                  class="swap-button"
                  aria-label="Tukar lokasi penjemputan dan tujuan"
                  title="Tukar lokasi jemput dan tujuan"
                  :disabled="busy || !!selection || !pickup || !destination"
                  @click="swapPoints"
                >
                  <ArrowUpDown :size="18" />
                </button>
              </div>
              <div class="location-row">
                <span class="point-badge point-b">B</span>
                <div class="location-content">
                  <label for="destination-button">Lokasi tujuan</label>
                  <button
                    id="destination-button"
                    class="location-button"
                    :class="{
                      selected: destination,
                      active: selection === 'destination',
                    }"
                    :disabled="busy"
                    :aria-pressed="selection === 'destination'"
                    @click="openPlacePicker('destination')"
                  >
                    <span
                      ><strong>{{ destinationDisplayName }}</strong
                      ><small>{{ destinationDisplayAddress }}</small></span
                    >
                  </button>
                </div>
              </div>
            </div>

            <!-- <div class="location-tip">
              <span>Marker pada peta dapat digeser untuk memperbaiki lokasi.</span>
            </div> -->
            <button
              class="primary-button inline-calculate"
              :disabled="busy || locatingInitialPickup || (!selection && !ready)"
              @click="selection ? confirmMapSelection() : calculate()"
            >
              <LoaderCircle
                v-if="busy || locatingInitialPickup"
                :size="19"
                class="spinner"
              /><MapPin v-else-if="selection" :size="19" /><span>{{ actionLabel }}</span>
            </button>
            <button
              v-if="pickup || destination"
              class="reset-button"
              :disabled="busy"
              @click="reset"
            >
              <RotateCcw :size="15" /> Mulai ulang
            </button>
          </section>

          <section
            v-if="estimate || busy || error"
            ref="resultRegion"
            class="result-card"
            :class="{ 'has-result': estimate }"
            tabindex="-1"
            aria-labelledby="result-title"
            aria-live="polite"
            :aria-busy="busy"
          >
            <div class="result-title">
              <h2 id="result-title">Estimasi perjalanan</h2>
              <span v-if="estimate" class="success-tag"
                ><Check :size="13" /> Rute ditemukan</span
              ><span v-else class="result-dot" />
            </div>
            <template v-if="estimate">
              <div class="price-total">
                <span>Estimasi biaya pengiriman</span
                ><strong>{{ formatCurrency(estimate.pricing.total) }}</strong
                ><small>Termasuk {{ estimate.pricing.includedKm }} km pertama</small>
              </div>
              <div class="result-metrics">
                <div>
                  <span><Route :size="16" /> Jarak jalan</span
                  ><strong>{{ formatDistance(estimate.distanceKm) }}</strong>
                </div>
                <div>
                  <span><Clock3 :size="16" /> Waktu tempuh</span
                  ><strong>{{ formatDuration(estimate.durationMinutes) }}</strong>
                </div>
              </div>
              <details class="price-details">
                <summary>Rincian biaya <ChevronDown :size="16" /></summary>
                <div>
                  <span>Tarif dasar</span
                  ><strong>{{ formatCurrency(estimate.pricing.baseFare) }}</strong>
                </div>
                <div>
                  <span
                    >Tambahan {{ estimate.pricing.billableKm }} km ×
                    {{ formatCurrency(estimate.pricing.pricePerKm) }}</span
                  ><strong>{{ formatCurrency(estimate.pricing.distanceFare) }}</strong>
                </div>
                <div
                  v-if="
                    estimate.pricing.total >
                    estimate.pricing.baseFare + estimate.pricing.distanceFare
                  "
                >
                  <span>Penyesuaian tarif minimum</span
                  ><strong>{{
                    formatCurrency(
                      estimate.pricing.total -
                        estimate.pricing.baseFare -
                        estimate.pricing.distanceFare
                    )
                  }}</strong>
                </div>
              </details>
              <a
                v-if="bookingUrl"
                class="whatsapp-button"
                :href="bookingUrl"
                target="_blank"
                rel="noopener noreferrer"
                ><MessageCircle :size="20" /><span>Pesan via WhatsApp</span></a
              >
              <button v-else class="whatsapp-button" disabled>
                <MessageCircle :size="20" /> Pesan via WhatsApp
              </button>
              <p v-if="!bookingUrl" class="booking-note">
                {{
                  settings
                    ? "Pemesanan tersedia setelah nomor WhatsApp AntarFix dikonfigurasi."
                    : "Informasi pemesanan belum dapat dimuat."
                }}
              </p>
              <p class="estimate-note">
                Harga dan waktu bersifat estimasi. Biaya akhir dikonfirmasi oleh AntarFix.
              </p>
              <button class="reset-button" :disabled="busy" @click="reset">
                <RotateCcw :size="15" /> Hitung perjalanan lain
              </button>
            </template>
            <div v-else-if="busy" class="result-empty">
              <span class="empty-icon calculating-icon"
                ><LoaderCircle :size="27" class="spinner" /></span
              ><strong>Mencari rute perjalananmu</strong>
              <p>Jarak, waktu, dan biaya sedang dihitung.<br />Tunggu sebentar, ya.</p>
            </div>
            <div v-else-if="error" class="result-error" role="alert">
              <Info :size="25" /><strong>Rute belum berhasil dihitung</strong>
              <p>{{ error }}</p>
              <button class="text-button" @click="calculate">
                Coba lagi <ArrowRight :size="16" />
              </button>
            </div>
          </section>
        </div>

        <div
          ref="mapRegion"
          class="map-column"
          tabindex="-1"
          role="region"
          aria-label="Pemilihan titik di peta"
        >
          <EstimatorMap
            ref="mapComponent"
            :pickup="pickup"
            :destination="destination"
            :selection="selection"
            :estimate="estimate"
            :busy="busy"
            @choose="choose"
            @preview="previewCenter"
            @preview-start="startCenterPreview"
            @located="deviceLocation = $event"
          />
          <div class="map-caption"><span>Jarak mengikuti rute jalan.</span></div>
        </div>
      </div>

      <div class="closing-line">
        <Package :size="16" /><span>Dari titik A ke B, AntarFix bantu hitungkan.</span>
      </div>
    </main>

    <footer>
      <a class="footer-brand" href="/">AntarFix<span> Estimator</span></a
      ><span>Bagian dari ekosistem AntarFix</span
      ><a class="footer-link" href="/privacy.html">Privasi lokasi</a
      ><span class="footer-right">Dibuat untuk perjalanan yang lebih mudah.</span>
    </footer>

    <div
      v-if="showPlacePicker"
      class="place-picker-backdrop"
      @click.self="closePlacePicker"
    >
      <section
        ref="placePicker"
        class="place-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="place-picker-title"
        tabindex="-1"
        @keydown.esc="closePlacePicker"
      >
        <header class="place-picker-header">
          <div>
            <span
              class="picker-badge"
              :class="searchTarget === 'pickup' ? 'point-a' : 'point-b'"
              >{{ searchTarget === "pickup" ? "A" : "B" }}</span
            >
            <div>
              <h2 id="place-picker-title">
                {{
                  searchTarget === "pickup" ? "Pilih titik jemput" : "Pilih titik tujuan"
                }}
              </h2>
              <p>Cari nama tempat, pilih dari peta, atau masukkan koordinat.</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Tutup pemilih lokasi"
            @click="closePlacePicker"
          >
            <X :size="20" />
          </button>
        </header>

        <form class="place-search" role="search" @submit.prevent="submitPlaceSearch">
          <label for="place-query">Cari tempat atau alamat</label>
          <div class="place-search-row">
            <select
              v-model="searchTarget"
              aria-label="Gunakan hasil pencarian untuk"
              @change="manualTarget = searchTarget"
            >
              <option value="pickup">A · Jemput</option>
              <option value="destination">B · Tujuan</option>
            </select>
            <div class="place-search-input">
              <Search :size="17" /><input
                id="place-query"
                v-model="searchQuery"
                type="search"
                maxlength="120"
                autocomplete="off"
                placeholder="Contoh: Warung Mie Ayam"
                :disabled="searchBusy || busy"
              />
            </div>
            <button
              type="submit"
              class="search-button"
              :disabled="searchBusy || busy"
              aria-label="Cari lokasi"
            >
              <LoaderCircle v-if="searchBusy" :size="18" class="spinner" /><Search
                v-else
                :size="18"
              /><span>Cari</span>
            </button>
          </div>
          <p v-if="searchError" class="search-message" role="status">{{ searchError }}</p>
          <ul
            v-if="searchResults.length"
            class="search-results"
            aria-label="Hasil pencarian lokasi"
          >
            <li
              v-for="place in searchResults"
              :key="`${place.lat},${place.lng},${place.name}`"
            >
              <button type="button" @click="selectSearchResult(place)">
                <span class="search-result-icon"><MapPin :size="16" /></span
                ><span
                  ><strong>{{ place.name }}</strong
                  ><small>{{ place.address }}</small></span
                ><ArrowRight :size="16" />
              </button>
            </li>
          </ul>
          <a
            class="search-attribution"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            >Data lokasi © OpenStreetMap contributors</a
          >
        </form>

        <button type="button" class="pick-map-button" @click="pickOnMap">
          <span><MousePointer2 :size="19" /></span
          ><span
            ><strong>Pilih langsung di peta</strong
            ><small>Geser peta sampai pin berada di lokasi</small></span
          >
        </button>

        <details
          ref="manualDetails"
          class="manual-coordinates picker-manual"
          @toggle="toggleManual"
        >
          <summary>Opsi lainnya: masukkan koordinat <ChevronDown :size="15" /></summary>
          <form @submit.prevent="setManual">
            <div class="coordinate-inputs">
              <label
                >Latitude<input
                  v-model="manualLat"
                  :disabled="busy"
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  placeholder="-8.4932"
                  required /></label
              ><label
                >Longitude<input
                  v-model="manualLng"
                  :disabled="busy"
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  placeholder="140.4018"
                  required
              /></label>
            </div>
            <p v-if="manualError" class="manual-error" role="alert">{{ manualError }}</p>
            <button type="submit" class="text-button" :disabled="busy">
              Gunakan sebagai titik {{ searchTarget === "pickup" ? "A" : "B" }}
              <ArrowRight :size="15" />
            </button>
          </form>
        </details>
      </section>
    </div>

    <div
      v-if="showMobileAction"
      class="mobile-action-bar"
      aria-label="Langkah berikutnya"
    >
      <div class="mobile-action-inner">
        <div class="mobile-action-meta">
          <span>{{ mobileActionHint }}</span
          ><small>{{ selectedCount }}/2 lokasi dipilih</small>
        </div>
        <button
          class="primary-button"
          :disabled="busy || locatingInitialPickup"
          @click="mobileAction"
        >
          <LoaderCircle
            v-if="busy || locatingInitialPickup"
            :size="20"
            class="spinner"
          /><MapPin v-else-if="selection || !pickup || !destination" :size="20" /><span>{{
            actionLabel
          }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
