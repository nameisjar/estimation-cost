<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, watch, ref } from 'vue';
import L from 'leaflet';
import { LoaderCircle, LocateFixed, Maximize2 } from 'lucide-vue-next';
import type { GeoJsonObject } from 'geojson';
import 'leaflet/dist/leaflet.css';
import type { LocationPoint, Selection, Estimate, GeocodedPlace, MapPlace } from '../types';
import { getMapPlaces } from '../services/estimate.service';
import { placeIconLabel, placeIconSvg, resolvePlaceIcon } from '../utils/place-icons';

const props = defineProps<{
  pickup: LocationPoint | null;
  destination: LocationPoint | null;
  pickupPlace: GeocodedPlace | null;
  destinationPlace: GeocodedPlace | null;
  previewPoint: LocationPoint | null;
  previewPlace: GeocodedPlace | null;
  previewTarget: Selection | null;
  selection: Selection | null;
  estimate: Estimate | null;
  busy: boolean;
}>();
const emit = defineEmits<{ choose: [point: LocationPoint, target: Selection]; preview: [point: LocationPoint, target: Selection, nearbyPlace?: GeocodedPlace]; 'preview-start': [target: Selection]; located: [point: LocationPoint] }>();
const container = ref<HTMLDivElement>();
const notice = ref('');
const locationPending = ref(false);
const centerPoint = ref<LocationPoint | null>(null);
const userLocationPoint = ref<LocationPoint | null>(null);
const mapMoving = ref(false);
const pinSettling = ref(false);
const centerPicking = computed(() => !!props.selection && !props.busy);
const centerAtUserLocation = computed(() => {
  if (!centerPicking.value || !centerPoint.value || !userLocationPoint.value) return false;
  return L.latLng(centerPoint.value.lat, centerPoint.value.lng)
    .distanceTo(L.latLng(userLocationPoint.value.lat, userLocationPoint.value.lng)) < 25;
});
let map: L.Map;
let pickupMarker: L.Marker | null = null;
let destinationMarker: L.Marker | null = null;
let routeLayer: L.Polyline | null = null;
let routeOutline: L.Polyline | null = null;
let userLocationMarker: L.Marker | null = null;
let accuracyCircle: L.Circle | null = null;
let surveyPlaceLayer: L.LayerGroup | null = null;
let locationHighlightLayer: L.LayerGroup | null = null;
let observer: ResizeObserver;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
let settleTimer: ReturnType<typeof setTimeout> | undefined;
let placeLoadTimer: ReturnType<typeof setTimeout> | undefined;
let placeLoadController: AbortController | undefined;
let placeLoadVersion = 0;
let loadedSurveyPlaces: MapPlace[] = [];
let visibleLabelIds = new Set<string>();
let forcedLabelPlaceId: string | null = null;
let focusedSearchPlace: GeocodedPlace | null = null;
let alive = true;

function escapeMarkup(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function surveyPlaceIcon(place: MapPlace, showLabel: boolean, selectedLabel: boolean) {
  const category = place.type || 'other';
  const iconType = resolvePlaceIcon(place.iconType, category);
  const iconMarkup = placeIconSvg[iconType].replace(
    /<(path|circle|rect|line|polyline|polygon|ellipse)\b/g,
    '<$1 vector-effect="non-scaling-stroke"',
  );
  const label = showLabel
    ? `<span class="survey-place-inline-label${selectedLabel ? ' selected' : ''}">${escapeMarkup(place.name)}</span>`
    : '';
  return L.divIcon({
    className: `survey-place-marker survey-category-${category}${showLabel ? ' has-label' : ''}`,
    html: `<span class="survey-place-content"><span class="survey-place-dot" aria-hidden="true"><svg viewBox="0 0 16 16">${iconMarkup}</svg></span>${label}</span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function displayRules(zoom: number) {
  const compact = (container.value?.clientWidth || window.innerWidth) <= 540;
  if (zoom < 16) return { maximum: 0, cellWidth: 9999, cellHeight: 9999, requestLimit: 1, labelMaximum: 0 };
  if (zoom === 16) return { maximum: 18, cellWidth: 155, cellHeight: 56, requestLimit: 100, labelMaximum: compact ? 0 : 3 };
  if (zoom === 17) return { maximum: 32, cellWidth: 116, cellHeight: 46, requestLimit: 140, labelMaximum: compact ? 4 : 8 };
  if (zoom === 18) return { maximum: 56, cellWidth: 86, cellHeight: 38, requestLimit: 180, labelMaximum: compact ? 7 : 16 };
  return { maximum: 84, cellWidth: 68, cellHeight: 32, requestLimit: 200, labelMaximum: compact ? 10 : 20 };
}

function declutterPlaces(places: MapPlace[], zoom: number): MapPlace[] {
  const rules = displayRules(zoom);
  if (!rules.maximum) return [];
  const focus = map.project(map.getCenter(), zoom);
  const displayScore = (place: MapPlace) => {
    const nearPicker = centerPicking.value && map.project([place.lat, place.lng], zoom).distanceTo(focus) <= 52;
    return place.labelPriority + (nearPicker ? 2_000 : 0);
  };
  const sorted = [...places].sort((a, b) =>
    displayScore(b) - displayScore(a) || b.popularity - a.popularity || a.name.localeCompare(b.name, 'id'),
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

type LabelRect = { left: number; right: number; top: number; bottom: number };
const priorityLabelCategories = new Set(['medical', 'education', 'government', 'transport']);

function rectanglesOverlap(first: LabelRect, second: LabelRect): boolean {
  return first.left < second.right && first.right > second.left
    && first.top < second.bottom && first.bottom > second.top;
}

function stableVisibleLabels(places: MapPlace[], zoom: number, selecting: boolean): Set<string> {
  const { labelMaximum } = displayRules(zoom);
  const nextVisible = new Set<string>();
  if (!labelMaximum) {
    visibleLabelIds = nextVisible;
    return nextVisible;
  }
  const size = map.getSize();
  const viewportCenter = map.getCenter();
  const occupied: LabelRect[] = [];
  const ranked = [...places].sort((first, second) => {
    const firstDistance = map.distance(viewportCenter, [first.lat, first.lng]);
    const secondDistance = map.distance(viewportCenter, [second.lat, second.lng]);
    const firstScore = first.labelPriority + (priorityLabelCategories.has(first.type || '') ? 220 : 0)
      + (visibleLabelIds.has(first.id) ? 420 : 0) + (first.id === forcedLabelPlaceId ? 4_000 : 0)
      + (selecting && firstDistance <= 75 ? 1_000 : 0) - firstDistance * 0.9;
    const secondScore = second.labelPriority + (priorityLabelCategories.has(second.type || '') ? 220 : 0)
      + (visibleLabelIds.has(second.id) ? 420 : 0) + (second.id === forcedLabelPlaceId ? 4_000 : 0)
      + (selecting && secondDistance <= 75 ? 1_000 : 0) - secondDistance * 0.9;
    return secondScore - firstScore || second.popularity - first.popularity;
  });
  for (const place of ranked) {
    const point = map.latLngToContainerPoint([place.lat, place.lng]);
    const width = Math.min(138, Math.max(58, 18 + place.name.length * 5.2));
    const height = place.name.length > 22 && size.x <= 540 ? 34 : 21;
    const left = point.x - width / 2;
    const top = point.y + 13;
    const rect = { left, right: left + width, top, bottom: top + height };
    const forced = place.id === forcedLabelPlaceId;
    if (!forced && (rect.left < 6 || rect.right > size.x - 6 || rect.top < 6 || rect.bottom > size.y - 6)) continue;
    if (!forced && occupied.some(current => rectanglesOverlap(current, rect))) continue;
    occupied.push(rect);
    nextVisible.add(place.id);
    if (nextVisible.size >= labelMaximum) break;
  }
  visibleLabelIds = nextVisible;
  return nextVisible;
}

function renderSurveyPlaces(places: MapPlace[]) {
  if (!map || !surveyPlaceLayer) return;
  surveyPlaceLayer.clearLayers();
  const selecting = centerPicking.value;
  const displayedPlaces = declutterPlaces(places, map.getZoom());
  if (forcedLabelPlaceId && !displayedPlaces.some(place => place.id === forcedLabelPlaceId)) forcedLabelPlaceId = null;
  const labelIds = stableVisibleLabels(displayedPlaces, map.getZoom(), selecting);
  for (const place of displayedPlaces) {
    const selectedLabel = place.id === forcedLabelPlaceId;
    const marker = L.marker([place.lat, place.lng], {
      icon: surveyPlaceIcon(place, labelIds.has(place.id) || selectedLabel, selectedLabel),
      title: `${place.name} · ${placeIconLabel(place.iconType, place.type)}`,
      alt: place.name,
      riseOnHover: true,
      zIndexOffset: -250,
      opacity: selecting ? 0.82 : 1,
    }).addTo(surveyPlaceLayer);
    marker.on('click', () => {
      forcedLabelPlaceId = place.id;
      renderSurveyPlaces(loadedSurveyPlaces);
      if (centerPicking.value && props.selection && !props.busy) map.panTo([place.lat, place.lng]);
    });
  }
}

function scheduleSurveyPlaces() {
  if (!map || !surveyPlaceLayer) return;
  if (placeLoadTimer) clearTimeout(placeLoadTimer);
  placeLoadController?.abort();
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
    const controller = new AbortController();
    placeLoadController = controller;
    try {
      const places = await getMapPlaces({
        north: bounds.getNorth(), south: bounds.getSouth(),
        east: bounds.getEast(), west: bounds.getWest(),
      }, zoom, rules.requestLimit, controller.signal);
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

function icon(target: Selection) {
  const markerClass = target === 'pickup' ? 'marker-pickup' : 'marker-destination';
  const gradientId = `saved-marker-gradient-${target}`;
  const shape = target === 'pickup'
    ? '<circle class="saved-marker-shape" style="fill:url(#saved-marker-gradient-pickup)" cx="17" cy="15" r="12" vector-effect="non-scaling-stroke"/><ellipse class="saved-marker-highlight" cx="12.5" cy="9.5" rx="4.8" ry="2.4" transform="rotate(-24 12.5 9.5)"/>'
    : '<path class="saved-marker-shape" style="fill:url(#saved-marker-gradient-destination)" d="M17 2.5C9.2 2.5 3 8.6 3 16.2c0 8.5 8.6 14.1 14 17.8 5.4-3.7 14-9.3 14-17.8C31 8.6 24.8 2.5 17 2.5Z" vector-effect="non-scaling-stroke"/><ellipse class="saved-marker-highlight" cx="12.5" cy="8.8" rx="5.5" ry="2.8" transform="rotate(-24 12.5 8.8)"/>';
  const stemStart = target === 'pickup' ? 20 : 29;
  return L.divIcon({
    className: 'point-marker',
    html: `<svg class="saved-marker ${markerClass}" viewBox="0 0 34 42" aria-hidden="true"><defs><linearGradient id="${gradientId}" x1="6" y1="4" x2="28" y2="33" gradientUnits="userSpaceOnUse"><stop class="saved-marker-gradient-light"/><stop class="saved-marker-gradient-dark" offset="1"/></linearGradient></defs><path class="saved-marker-stem-shadow" d="M17 ${stemStart}V38" vector-effect="non-scaling-stroke"/><path class="saved-marker-stem" d="M17 ${stemStart}V38" vector-effect="non-scaling-stroke"/><g class="saved-marker-body">${shape}<circle class="saved-marker-core" cx="17" cy="15" r="4" vector-effect="non-scaling-stroke"/></g><g class="saved-marker-crosshair"><circle cx="17" cy="38" r="6.5" vector-effect="non-scaling-stroke"/><path d="M17 28.5V33M17 43V47.5M7.5 38H12M22 38H26.5" vector-effect="non-scaling-stroke"/></g><circle class="saved-marker-dot" cx="17" cy="38" r="2.75" vector-effect="non-scaling-stroke"/></svg>`,
    iconSize: [34, 42],
    iconAnchor: [17, 38],
  });
}

function addLocationHighlight(
  point: LocationPoint,
  place: GeocodedPlace | null,
  target: Selection,
  allowPointFallback = true,
) {
  if (!locationHighlightLayer) return;
  const outline = target === 'pickup' ? '#07509a' : '#f25308';
  const areaGeometry = place?.geometryKind === 'area';
  const className = `selected-location-highlight ${areaGeometry ? 'area' : 'building'} ${target}`;
  if (place?.geometry) {
    try {
      L.geoJSON(place.geometry as GeoJsonObject, {
        pane: 'selectionHighlights',
        interactive: false,
        style: {
          color: outline,
          weight: areaGeometry ? 2.5 : 2,
          opacity: 0.9,
          fillColor: '#f5cf32',
          fillOpacity: areaGeometry ? 0.3 : 0.58,
          className,
        },
      }).addTo(locationHighlightLayer);
      return;
    } catch {
      // Confirmed locations may still use the compact point fallback below.
    }
  }
  if (!allowPointFallback) return;
  L.circleMarker([point.lat, point.lng], {
    pane: 'selectionHighlights',
    interactive: false,
    radius: 11,
    color: outline,
    weight: 2,
    opacity: 0.9,
    fillColor: '#f5cf32',
    fillOpacity: 0.5,
    className,
  }).addTo(locationHighlightLayer);
}

function syncLocationHighlights() {
  if (!map || !locationHighlightLayer) return;
  locationHighlightLayer.clearLayers();
  if (props.pickup && !(centerPicking.value && props.selection === 'pickup'))
    addLocationHighlight(props.pickup, props.pickupPlace, 'pickup');
  if (props.destination && !(centerPicking.value && props.selection === 'destination'))
    addLocationHighlight(props.destination, props.destinationPlace, 'destination');
  if (centerPicking.value && props.selection && props.previewTarget === props.selection && props.previewPoint)
    addLocationHighlight(props.previewPoint, props.previewPlace, props.selection, false);
}

function showNotice(message: string, autoHide = false) {
  notice.value = message;
  if (noticeTimer) clearTimeout(noticeTimer);
  if (autoHide) noticeTimer = setTimeout(() => { if (alive) notice.value = ''; }, 5500);
}

function updateMarker(point: LocationPoint | null, marker: L.Marker | null, target: Selection): L.Marker | null {
  if (!point) { marker?.remove(); return null; }
  const label = target === 'pickup' ? 'lokasi jemput' : 'tujuan';
  if (!marker) {
    marker = L.marker([point.lat, point.lng], {
      icon: icon(target),
      draggable: !props.busy,
      title: `${target === 'pickup' ? 'Lokasi penjemputan' : 'Lokasi tujuan'}. Marker dapat digeser.`,
      alt: target === 'pickup' ? 'Lokasi penjemputan yang dapat digeser' : 'Lokasi tujuan yang dapat digeser',
    }).addTo(map);
    marker.on('dragstart', () => {
      marker?.getElement()?.classList.add('dragging-point-marker');
      showNotice(`Geser marker ${label}; crosshair menunjukkan koordinat tepatnya.`);
    });
    marker.on('dragend', () => {
      marker?.getElement()?.classList.remove('dragging-point-marker');
      if (!props.busy && marker) {
        const movedPoint = marker.getLatLng();
        emit('choose', { lat: movedPoint.lat, lng: movedPoint.lng }, target);
        showNotice(`Marker ${label} diperbarui. Nama lokasi sedang dicari.`, true);
      }
    });
  } else marker.setLatLng([point.lat, point.lng]);
  return marker;
}

function syncMarkers() {
  if (!map) return;
  pickupMarker = updateMarker(centerPicking.value && props.selection === 'pickup' ? null : props.pickup, pickupMarker, 'pickup');
  destinationMarker = updateMarker(centerPicking.value && props.selection === 'destination' ? null : props.destination, destinationMarker, 'destination');
  syncReferenceVisuals();
  syncLocationHighlights();
}

function syncReferenceVisuals() {
  if (!map) return;
  pickupMarker?.getElement()?.classList.toggle('compact-reference-marker', centerPicking.value && props.selection === 'destination');
  destinationMarker?.getElement()?.classList.toggle('compact-reference-marker', centerPicking.value && props.selection === 'pickup');

  const userPoint = userLocationMarker?.getLatLng();
  const pickupPoint = props.pickup ? L.latLng(props.pickup.lat, props.pickup.lng) : null;
  const overlapsPickup = !!(userPoint && pickupPoint && map.distance(userPoint, pickupPoint) < 25);
  pickupMarker?.getElement()?.classList.toggle('at-user-location', overlapsPickup);
  userLocationMarker?.setOpacity(1);
  accuracyCircle?.setStyle({ opacity: 0.45, fillOpacity: 0.12 });
}

function syncCenterPoint() {
  if (!map || !centerPicking.value) return;
  const center = map.getCenter();
  centerPoint.value = { lat: center.lat, lng: center.lng };
}

function nearestLoadedPlace(point: LocationPoint, radiusMeters = 60): GeocodedPlace | undefined {
  let nearest: MapPlace | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const place of loadedSurveyPlaces) {
    const distance = map.distance([point.lat, point.lng], [place.lat, place.lng]);
    if (distance < nearestDistance) {
      nearest = place;
      nearestDistance = distance;
    }
  }
  return nearest && nearestDistance <= radiusMeters
    ? { ...nearest, distanceMeters: Math.round(nearestDistance) }
    : undefined;
}

function focusedPlaceAt(point: LocationPoint): GeocodedPlace | undefined {
  if (!focusedSearchPlace) return undefined;
  const distance = map.distance(
    [point.lat, point.lng],
    [focusedSearchPlace.lat, focusedSearchPlace.lng],
  );
  return distance <= 10
    ? { ...focusedSearchPlace, distanceMeters: Math.round(distance) }
    : undefined;
}

function publishCenterPreview() {
  syncCenterPoint();
  if (centerPoint.value && props.selection) {
    const point = { ...centerPoint.value };
    emit('preview', point, props.selection, focusedPlaceAt(point) || nearestLoadedPlace(point));
  }
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
  userLocationPoint.value = { ...point };
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
        showNotice(`Lokasi perangkat digunakan sebagai ${target === 'pickup' ? 'lokasi jemput' : 'tujuan'}. Marker dapat digeser.`, true);
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

function beginSelection(target: Selection, initialPlace?: GeocodedPlace) {
  if (!map) return false;
  focusedSearchPlace = initialPlace || null;
  const startingPoint = initialPlace || (target === 'pickup'
    ? props.pickup || userLocationMarker?.getLatLng()
    : props.destination || props.pickup);
  if (startingPoint) map.setView([startingPoint.lat, startingPoint.lng], Math.max(map.getZoom(), 16));
  publishCenterPreview();
  return true;
}

function confirmCenterSelection() {
  const target = props.selection;
  if (!centerPicking.value || !target || !centerPoint.value || mapMoving.value) return false;
  emit('choose', { ...centerPoint.value }, target);
  showNotice(`${target === 'pickup' ? 'Lokasi jemput' : 'Tujuan'} dipilih. Marker dapat digeser untuk memperbaiki lokasi.`, true);
  return true;
}

defineExpose({ fitMap, locateForSelection, beginSelection, confirmCenterSelection });

watch(() => [
  props.pickup,
  props.destination,
  props.pickupPlace,
  props.destinationPlace,
  props.previewPoint,
  props.previewPlace,
  props.previewTarget,
  props.selection,
], syncMarkers);
watch(() => props.selection, target => {
  focusedSearchPlace = null;
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
  map.attributionControl.setPrefix(false);
  map.createPane('selectionHighlights');
  const highlightPane = map.getPane('selectionHighlights');
  if (highlightPane) {
    highlightPane.style.zIndex = '380';
    highlightPane.style.pointerEvents = 'none';
  }
  locationHighlightLayer = L.layerGroup().addTo(map);
  surveyPlaceLayer = L.layerGroup().addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>' }).addTo(map).on('tileerror', () => { showNotice('Sebagian peta belum dimuat. Periksa koneksi internet Anda.'); });
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
    renderSurveyPlaces(loadedSurveyPlaces);
    scheduleSurveyPlaces();
  });
  map.on('click', event => {
    if (!props.selection || props.busy) return;
    if (centerPicking.value) map.panTo(event.latlng);
    else emit('choose', { lat: event.latlng.lat, lng: event.latlng.lng }, props.selection);
  });
  observer = new ResizeObserver(() => {
    map.invalidateSize();
    renderSurveyPlaces(loadedSurveyPlaces);
  });
  observer.observe(container.value!);
  syncMarkers();
  scheduleSurveyPlaces();
});

onBeforeUnmount(() => {
  alive = false;
  if (noticeTimer) clearTimeout(noticeTimer);
  if (settleTimer) clearTimeout(settleTimer);
  if (placeLoadTimer) clearTimeout(placeLoadTimer);
  placeLoadController?.abort();
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
    <div v-if="centerPicking" class="center-picker-target" :class="[selection === 'pickup' ? 'pickup' : 'destination', { moving: mapMoving, settling: pinSettling, 'at-user-location': centerAtUserLocation }]" aria-hidden="true">
      <svg class="center-picker-icon" viewBox="0 0 56 74">
        <defs>
          <linearGradient id="center-picker-gradient" x1="10" y1="5" x2="46" y2="49" gradientUnits="userSpaceOnUse">
            <stop class="center-picker-gradient-light" />
            <stop class="center-picker-gradient-dark" offset="1" />
          </linearGradient>
        </defs>
        <g class="center-picker-guide">
          <path class="center-picker-guide-shadow" :d="selection === 'pickup' ? 'M28 34V70' : 'M28 47V70'" vector-effect="non-scaling-stroke" />
          <path class="center-picker-guide-line" :d="selection === 'pickup' ? 'M28 34V70' : 'M28 47V70'" vector-effect="non-scaling-stroke" />
        </g>
        <g class="center-picker-body">
          <template v-if="selection === 'pickup'">
            <circle class="center-picker-shape" cx="28" cy="23" r="17" vector-effect="non-scaling-stroke" />
            <ellipse class="center-picker-highlight" cx="21" cy="15" rx="7" ry="3.5" transform="rotate(-24 21 15)" />
          </template>
          <template v-else>
            <path class="center-picker-shape" d="M28 2C15.7 2 6 11.6 6 23.8c0 13.2 13.5 22 22 27.4 8.5-5.4 22-14.2 22-27.4C50 11.6 40.3 2 28 2Z" vector-effect="non-scaling-stroke" />
            <ellipse class="center-picker-highlight" cx="20" cy="12" rx="8.5" ry="4.2" transform="rotate(-24 20 12)" />
          </template>
          <circle class="center-picker-core" cx="28" :cy="selection === 'pickup' ? 23 : 22" :r="selection === 'pickup' ? 5 : 5.5" vector-effect="non-scaling-stroke" />
        </g>
        <circle class="center-picker-dot" cx="28" cy="70" r="3.5" vector-effect="non-scaling-stroke" />
      </svg>
      <span v-if="centerAtUserLocation" class="center-picker-location-label">Lokasi Anda</span>
    </div>
    <div v-else-if="busy || estimate || (!pickup && !destination)" class="map-hint" aria-live="polite">
      <span>{{ busy ? 'Menghitung rute perjalanan…' : estimate ? 'Rute ditemukan. Marker dapat digeser.' : 'Pilih titik untuk mulai' }}</span>
    </div>
  </section>
</template>
