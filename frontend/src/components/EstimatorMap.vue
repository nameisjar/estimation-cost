<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, watch, ref } from 'vue';
import L from 'leaflet';
import { LoaderCircle, LocateFixed, Maximize2 } from 'lucide-vue-next';
import 'leaflet/dist/leaflet.css';
import type { LocationPoint, Selection, Estimate, MapPlace } from '../types';
import { getMapPlaces } from '../services/estimate.service';

const props = defineProps<{ pickup: LocationPoint | null; destination: LocationPoint | null; selection: Selection | null; estimate: Estimate | null; busy: boolean }>();
const emit = defineEmits<{ choose: [point: LocationPoint, target: Selection]; preview: [point: LocationPoint, target: Selection]; 'preview-start': [target: Selection]; located: [point: LocationPoint] }>();
const container = ref<HTMLDivElement>();
const notice = ref('');
const locationPending = ref(false);
const centerPoint = ref<LocationPoint | null>(null);
const mapMoving = ref(false);
const pinSettling = ref(false);
const centerPicking = computed(() => !!props.selection && !props.busy);
let map: L.Map;
let pickupMarker: L.Marker | null = null;
let destinationMarker: L.Marker | null = null;
let routeLayer: L.Polyline | null = null;
let routeOutline: L.Polyline | null = null;
let userLocationMarker: L.Marker | null = null;
let accuracyCircle: L.Circle | null = null;
let surveyPlaceLayer: L.LayerGroup | null = null;
let observer: ResizeObserver;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let placeLoadTimer: ReturnType<typeof setTimeout> | undefined;
let placeLoadVersion = 0;
let loadedSurveyPlaces: MapPlace[] = [];
let alive = true;

const categoryIcons: Record<string, string> = {
  medical: '<path d="M8 3v10M3 8h10"/>',
  education: '<path d="M2.5 4.5 8 2l5.5 2.5L8 7 2.5 4.5Zm2 1.8V10c2.3 1.7 4.7 1.7 7 0V6.3"/>',
  worship: '<path d="M3 12.5h10M4 10.5h8M5 10.5V6h6v4.5M8 2.5 4.5 6h7L8 2.5Z"/>',
  food: '<path d="M4 2v5M2.5 2v3.5C2.5 7 4 7 4 7s1.5 0 1.5-1.5V2M4 7v6M10.5 2v11M10.5 2c2 1.8 2 4 0 5"/>',
  lodging: '<path d="M2.5 11.5v-7M2.5 9h11v2.5M5 6.5h6.5c1.1 0 2 .9 2 2V9M5 5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"/>',
  finance: '<path d="m2 6 6-3.5L14 6M3 7.5h10M4 7.5v4M7 7.5v4M10 7.5v4M13 7.5v4M2 13h12"/>',
  automotive: '<path d="M9.8 3.1a3 3 0 0 0-3.7 3.7l-3.6 3.6a1.5 1.5 0 0 0 2.1 2.1l3.6-3.6a3 3 0 0 0 3.7-3.7L10 7.1 8.9 6l1.9-1.9-1-1Z"/>',
  government: '<path d="m2 6 6-3.5L14 6M3 7.5h10M4 7.5v4M8 7.5v4M12 7.5v4M2 13h12"/>',
  transport: '<path d="M2 4h8v7H2V4Zm8 2h2l2 2v3h-4V6ZM5 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm6.5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>',
  retail: '<path d="M4 5V4a4 4 0 0 1 8 0v1M2.5 5h11l-.8 8h-9.4l-.8-8ZM6 5V4a2 2 0 0 1 4 0v1"/>',
  service: '<path d="m8 2 .8 3.2L12 6l-3.2.8L8 10l-.8-3.2L4 6l3.2-.8L8 2ZM3 10l.4 1.6L5 12l-1.6.4L3 14l-.4-1.6L1 12l1.6-.4L3 10Z"/>',
  other: '<circle cx="8" cy="8" r="3"/>',
};

function categoryName(category?: string) {
  const names: Record<string, string> = {
    medical: 'Kesehatan', education: 'Pendidikan', worship: 'Tempat ibadah',
    food: 'Makanan', lodging: 'Penginapan', finance: 'Keuangan',
    automotive: 'Otomotif', government: 'Pemerintahan', transport: 'Transportasi',
    retail: 'Toko', service: 'Jasa', other: 'Tempat',
  };
  return names[category || 'other'] || 'Tempat';
}

function surveyPlaceIcon(place: MapPlace) {
  const category = place.type && categoryIcons[place.type] ? place.type : 'other';
  return L.divIcon({
    className: `survey-place-marker survey-category-${category}`,
    html: `<span class="survey-place-dot" aria-hidden="true"><svg viewBox="0 0 16 16">${categoryIcons[category]}</svg></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function displayRules(zoom: number) {
  if (zoom < 16) return { maximum: 0, cellWidth: 9999, cellHeight: 9999, requestLimit: 1 };
  if (zoom === 16) return { maximum: 16, cellWidth: 170, cellHeight: 60, requestLimit: 100 };
  if (zoom === 17) return { maximum: 30, cellWidth: 130, cellHeight: 50, requestLimit: 140 };
  if (zoom === 18) return { maximum: 52, cellWidth: 95, cellHeight: 42, requestLimit: 180 };
  return { maximum: 80, cellWidth: 74, cellHeight: 36, requestLimit: 200 };
}

function declutterPlaces(places: MapPlace[], zoom: number): MapPlace[] {
  const rules = displayRules(zoom);
  if (!rules.maximum) return [];
  const sorted = [...places].sort((a, b) =>
    b.labelPriority - a.labelPriority || b.popularity - a.popularity || a.name.localeCompare(b.name, 'id'),
  );
  const occupied = new Set<string>();
  const result: MapPlace[] = [];
  for (const place of sorted) {
    const point = map.project([place.lat, place.lng], zoom);
    const key = `${Math.floor(point.x / rules.cellWidth)}:${Math.floor(point.y / rules.cellHeight)}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    result.push(place);
    if (result.length >= rules.maximum) break;
  }
  return result;
}

function renderSurveyPlaces(places: MapPlace[]) {
  if (!map || !surveyPlaceLayer) return;
  surveyPlaceLayer.clearLayers();
  const selecting = centerPicking.value;
  for (const place of declutterPlaces(places, map.getZoom())) {
    const marker = L.marker([place.lat, place.lng], {
      icon: surveyPlaceIcon(place),
      title: `${place.name} · ${categoryName(place.type)}`,
      alt: place.name,
      riseOnHover: true,
      zIndexOffset: -250,
      opacity: selecting ? 0.68 : 1,
    }).addTo(surveyPlaceLayer);
    const label = document.createElement('span');
    label.className = 'survey-place-label-text';
    label.textContent = place.name;
    marker.bindTooltip(label, {
      permanent: !selecting,
      direction: selecting ? 'top' : 'right',
      offset: selecting ? [0, -10] : [7, 0],
      className: `survey-place-label${selecting ? ' selection-tooltip' : ''}`,
    });
    marker.on('click', () => {
      marker.openTooltip();
      if (centerPicking.value && props.selection && !props.busy) map.panTo([place.lat, place.lng]);
    });
  }
}

function scheduleSurveyPlaces() {
  if (!map || !surveyPlaceLayer) return;
  if (placeLoadTimer) clearTimeout(placeLoadTimer);
  const version = ++placeLoadVersion;
  placeLoadTimer = setTimeout(async () => {
    if (!alive || !map) return;
    const zoom = map.getZoom();
    const rules = displayRules(zoom);
    if (!rules.maximum) {
      loadedSurveyPlaces = [];
      surveyPlaceLayer?.clearLayers();
      return;
    }
    const bounds = map.getBounds();
    try {
      const places = await getMapPlaces({
        north: bounds.getNorth(), south: bounds.getSouth(),
        east: bounds.getEast(), west: bounds.getWest(),
      }, zoom, rules.requestLimit);
      if (alive && version === placeLoadVersion) {
        loadedSurveyPlaces = places;
        renderSurveyPlaces(places);
      }
    } catch {
      if (alive && version === placeLoadVersion) {
        loadedSurveyPlaces = [];
        surveyPlaceLayer?.clearLayers();
      }
    }
  }, 260);
}

function icon(letter: string) {
  const markerClass = letter === 'A' ? 'marker-a' : 'marker-b';
  return L.divIcon({
    className: 'point-marker',
    html: `<svg class="saved-marker ${markerClass}" viewBox="0 0 44 52" aria-hidden="true"><path class="saved-marker-shape" d="M22 2.5C11.5 2.5 3 10.9 3 21.4 3 34.4 16.8 43.5 22 47c5.2-3.5 19-12.6 19-25.6C41 10.9 32.5 2.5 22 2.5Z"/><text x="22" y="26">${letter}</text></svg>`,
    iconSize: [44, 52],
    iconAnchor: [22, 47],
  });
}

function showNotice(message: string, autoHide = false) {
  notice.value = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  if (autoHide) noticeTimer = setTimeout(() => { if (alive) notice.value = ''; }, 5500);
}

function updateMarker(point: LocationPoint | null, marker: L.Marker | null, letter: string, target: Selection): L.Marker | null {
  if (!point) { marker?.remove(); return null; }
  if (!marker) {
    marker = L.marker([point.lat, point.lng], {
      icon: icon(letter),
      draggable: !props.busy,
      title: `${letter === 'A' ? 'Titik A: penjemputan' : 'Titik B: tujuan'}. Marker dapat digeser.`,
      alt: letter === 'A' ? 'Lokasi penjemputan yang dapat digeser' : 'Lokasi tujuan yang dapat digeser',
    }).addTo(map);
    marker.on('dragstart', () => { showNotice(`Geser marker ${letter}, lalu lepaskan pada titik yang tepat.`); });
    marker.on('dragend', () => {
      if (!props.busy && marker) {
        const movedPoint = marker.getLatLng();
        emit('choose', { lat: movedPoint.lat, lng: movedPoint.lng }, target);
        showNotice(`Marker ${letter} diperbarui. Nama lokasi sedang dicari.`, true);
      }
    });
  } else marker.setLatLng([point.lat, point.lng]);
  return marker;
}

function syncMarkers() {
  if (!map) return;
  pickupMarker = updateMarker(centerPicking.value && props.selection === 'pickup' ? null : props.pickup, pickupMarker, 'A', 'pickup');
  destinationMarker = updateMarker(centerPicking.value && props.selection === 'destination' ? null : props.destination, destinationMarker, 'B', 'destination');
  syncReferenceVisuals();
}

function syncReferenceVisuals() {
  if (!map) return;
  pickupMarker?.getElement()?.classList.toggle('compact-reference-marker', centerPicking.value && props.selection === 'destination');
  destinationMarker?.getElement()?.classList.toggle('compact-reference-marker', centerPicking.value && props.selection === 'pickup');

  const userPoint = userLocationMarker?.getLatLng();
  const pickupPoint = props.pickup ? L.latLng(props.pickup.lat, props.pickup.lng) : null;
  const overlapsPickup = !!(centerPicking.value && userPoint && pickupPoint && map.distance(userPoint, pickupPoint) < 25);
  userLocationMarker?.setOpacity(overlapsPickup ? 0 : 1);
  accuracyCircle?.setStyle({ opacity: overlapsPickup ? 0 : 0.45, fillOpacity: overlapsPickup ? 0 : 0.12 });
}

function syncCenterPoint() {
  if (!map || !centerPicking.value) return;
  const center = map.getCenter();
  centerPoint.value = { lat: center.lat, lng: center.lng };
}

function publishCenterPreview() {
  syncCenterPoint();
  if (centerPoint.value && props.selection) emit('preview', { ...centerPoint.value }, props.selection);
}

function fitMap() {
  if (routeLayer) map.fitBounds(routeLayer.getBounds(), { padding: [48, 55], maxZoom: 16 });
  else {
    const points = [props.pickup, props.destination].filter((point): point is LocationPoint => !!point);
    if (points.length) map.fitBounds(L.latLngBounds(points.map(point => [point.lat, point.lng] as [number, number])), { padding: [50, 50], maxZoom: 15 });
    else if (userLocationMarker) map.setView(userLocationMarker.getLatLng(), 17);
    else map.setView([-8.4932, 140.4018], 14);
  }
}

function showUserLocation(point: LocationPoint, accuracy: number) {
  const latLng = L.latLng(point.lat, point.lng);
  if (!userLocationMarker) {
    const userIcon = L.divIcon({ className: 'user-location-marker', html: '<span class="user-location-dot"><i></i></span>', iconSize: [24, 24], iconAnchor: [12, 12] });
    userLocationMarker = L.marker(latLng, { icon: userIcon, interactive: false, keyboard: false, zIndexOffset: -100 }).addTo(map);
  } else userLocationMarker.setLatLng(latLng);
  if (!accuracyCircle) {
    accuracyCircle = L.circle(latLng, { radius: accuracy, color: '#1677c8', weight: 1, opacity: 0.45, fillColor: '#45a7ed', fillOpacity: 0.12, interactive: false }).addTo(map);
  } else accuracyCircle.setLatLng(latLng).setRadius(accuracy);
  syncReferenceVisuals();
}

async function locate(target?: Selection, useAsPoint = false): Promise<boolean> {
  if (locationPending.value) return false;
  if (!navigator.geolocation) {
    showNotice('Perangkat ini tidak mendukung lokasi otomatis. Pilih titik secara manual.');
    return false;
  }
  locationPending.value = true;
  showNotice('Mencari lokasi perangkat Anda…');
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(position => {
      locationPending.value = false;
      if (!alive) { resolve(false); return; }
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      emit('located', point);
      showUserLocation(point, Math.max(position.coords.accuracy || 0, 10));
      map.setView([point.lat, point.lng], 17);
      const pointIsStillEmpty = target !== 'pickup' || !props.pickup;
      if (target && useAsPoint && pointIsStillEmpty) {
        emit('choose', point, target);
        showNotice(`Lokasi perangkat digunakan sebagai titik ${target === 'pickup' ? 'A' : 'B'}. Marker dapat digeser.`, true);
      } else showNotice('Lokasi Anda ditemukan. Ketuk peta atau geser marker untuk menyesuaikan.', true);
      resolve(true);
    }, error => {
      locationPending.value = false;
      if (!alive) { resolve(false); return; }
      const message = error.code === error.PERMISSION_DENIED
        ? 'Izin lokasi ditolak. Aktifkan izin lokasi atau pilih titik secara manual.'
        : 'Lokasi perangkat belum dapat ditemukan. Pilih titik secara manual.';
      showNotice(message);
      resolve(false);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  });
}

function locateForSelection(target: Selection) {
  return locate(target, target === 'pickup' && !props.pickup);
}

function beginSelection(target: Selection) {
  if (!map) return false;
  const startingPoint = target === 'pickup'
    ? props.pickup || userLocationMarker?.getLatLng()
    : props.destination || props.pickup;
  if (startingPoint) map.setView([startingPoint.lat, startingPoint.lng], Math.max(map.getZoom(), 16));
  publishCenterPreview();
  return true;
}

function confirmCenterSelection() {
  const target = props.selection;
  if (!centerPicking.value || !target || !centerPoint.value || mapMoving.value) return false;
  emit('choose', { ...centerPoint.value }, target);
  showNotice(`Titik ${target === 'pickup' ? 'jemput A' : 'tujuan B'} dipilih. Marker dapat digeser untuk memperbaiki lokasi.`, true);
  return true;
}

defineExpose({ fitMap, locateForSelection, beginSelection, confirmCenterSelection });

watch(() => [props.pickup, props.destination, props.selection], syncMarkers);
watch(() => props.selection, target => {
  mapMoving.value = false;
  if (target && !props.busy) publishCenterPreview();
  else centerPoint.value = null;
  if (map) renderSurveyPlaces(loadedSurveyPlaces);
});
watch(() => props.busy, busy => {
  for (const marker of [pickupMarker, destinationMarker]) {
    if (busy) marker?.dragging?.disable();
    else marker?.dragging?.enable();
  }
});
watch(() => props.estimate, estimate => {
  if (!map) return;
  routeLayer?.remove(); routeOutline?.remove(); routeLayer = null; routeOutline = null;
  if (estimate) {
    const coordinates = estimate.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
    routeOutline = L.polyline(coordinates, { color: '#fff', weight: 9, opacity: 0.95 }).addTo(map);
    routeLayer = L.polyline(coordinates, { color: '#ff5a0a', weight: 5, opacity: 1 }).addTo(map);
    fitMap();
  }
});

onMounted(() => {
  map = L.map(container.value!, { zoomControl: false, scrollWheelZoom: false }).setView([-8.4932, 140.4018], 14);
  surveyPlaceLayer = L.layerGroup().addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }).addTo(map).on('tileerror', () => { showNotice('Sebagian peta belum dimuat. Periksa koneksi internet Anda.'); });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.on('movestart', () => {
    if (centerPicking.value && props.selection) {
      if (settleTimer) clearTimeout(settleTimer);
      pinSettling.value = false;
      mapMoving.value = true;
      emit('preview-start', props.selection);
    }
  });
  map.on('move', syncCenterPoint);
  map.on('moveend', () => {
    if (centerPicking.value) {
      publishCenterPreview();
      mapMoving.value = false;
      pinSettling.value = true;
      settleTimer = setTimeout(() => { if (alive) pinSettling.value = false; }, 360);
    }
    scheduleSurveyPlaces();
  });
  map.on('click', event => {
    if (!props.selection || props.busy) return;
    if (centerPicking.value) map.panTo(event.latlng);
    else emit('choose', { lat: event.latlng.lat, lng: event.latlng.lng }, props.selection);
  });
  observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(container.value!);
  syncMarkers();
  scheduleSurveyPlaces();
});

onBeforeUnmount(() => {
  alive = false;
  if (noticeTimer) clearTimeout(noticeTimer);
  if (settleTimer) clearTimeout(settleTimer);
  if (placeLoadTimer) clearTimeout(placeLoadTimer);
  placeLoadVersion++;
  observer?.disconnect();
  map?.remove();
});
</script>

<template>
  <section class="map-panel" :class="{ 'choosing-pickup': centerPicking && selection === 'pickup', 'choosing-destination': centerPicking && selection === 'destination' }" aria-label="Peta untuk memilih lokasi">
    <div ref="container" class="leaflet-map" :class="{ 'map-selecting': selection && !busy }" />
    <div class="map-actions"><button type="button" :disabled="locationPending" aria-label="Tampilkan lokasi saya" title="Lokasi saya" @click="locate()"><LoaderCircle v-if="locationPending" :size="19" class="spinner" /><LocateFixed v-else :size="19" /></button><button type="button" aria-label="Lihat seluruh rute" title="Lihat seluruh rute" @click="fitMap"><Maximize2 :size="18" /></button></div>
    <div v-if="notice" class="map-notice" role="status">{{ notice }} <button aria-label="Tutup pemberitahuan peta" @click="notice = ''">×</button></div>
    <div v-if="centerPicking" class="center-picker-target" :class="[selection === 'pickup' ? 'pickup' : 'destination', { moving: mapMoving, settling: pinSettling }]" aria-hidden="true">
      <svg class="center-picker-icon" viewBox="0 0 56 78">
        <g class="center-picker-guide">
          <path class="center-picker-guide-shadow" d="M28 43V72" />
          <path class="center-picker-guide-line" d="M28 43V72" />
        </g>
        <g class="center-picker-body">
          <path class="center-picker-shape" d="M28 2C15.3 2 5 12.3 5 25c0 15.5 15.7 26.5 23 31 7.3-4.5 23-15.5 23-31C51 12.3 40.7 2 28 2Z" />
          <text x="28" y="31">{{ selection === 'pickup' ? 'A' : 'B' }}</text>
        </g>
        <circle class="center-picker-dot" cx="28" cy="72" r="3.8" />
      </svg>
    </div>
    <div v-else-if="busy || estimate || (!pickup && !destination)" class="map-hint" aria-live="polite">
      <span>{{ busy ? 'Menghitung rute perjalanan…' : estimate ? 'Rute ditemukan. Marker dapat digeser.' : 'Pilih titik untuk mulai' }}</span>
    </div>
  </section>
</template>
