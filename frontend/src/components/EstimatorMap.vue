<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, watch, ref } from 'vue';
import L from 'leaflet';
import { LoaderCircle, LocateFixed, Maximize2 } from 'lucide-vue-next';
import 'leaflet/dist/leaflet.css';
import type { LocationPoint, Selection, Estimate } from '../types';

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
let observer: ResizeObserver;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let alive = true;

function icon(letter: string) {
  return L.divIcon({
    className: 'point-marker',
    html: `<span class="marker-pin marker-${letter.toLowerCase()}">${letter}<i class="marker-grip" aria-hidden="true"><b></b><b></b><b></b></i></span>`,
    iconSize: [38, 48],
    iconAnchor: [19, 45],
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
  });
  map.on('click', event => {
    if (!props.selection || props.busy) return;
    if (centerPicking.value) map.panTo(event.latlng);
    else emit('choose', { lat: event.latlng.lat, lng: event.latlng.lng }, props.selection);
  });
  observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(container.value!);
  syncMarkers();
});

onBeforeUnmount(() => {
  alive = false;
  if (noticeTimer) clearTimeout(noticeTimer);
  if (settleTimer) clearTimeout(settleTimer);
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
      <span class="center-picker-badge"><b>{{ selection === 'pickup' ? 'A' : 'B' }}</b></span>
      <span class="precision-reticle"><b /></span>
    </div>
    <div v-else-if="busy || estimate || (!pickup && !destination)" class="map-hint" aria-live="polite">
      <span>{{ busy ? 'Menghitung rute perjalanan…' : estimate ? 'Rute ditemukan. Marker dapat digeser.' : 'Pilih titik untuk mulai' }}</span>
    </div>
  </section>
</template>
