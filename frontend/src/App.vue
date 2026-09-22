<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Info,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
  Package,
  RotateCcw,
  Route,
  Search,
  X,
} from "lucide-vue-next";
import EstimatorMap from "./components/EstimatorMap.vue";
import LocationMarkerGlyph from "./components/LocationMarkerGlyph.vue";
import PlaceIconGlyph from "./components/PlaceIconGlyph.vue";
import WhatsAppIcon from "./components/WhatsAppIcon.vue";
import {
  estimateCost,
  getBuildingAt,
  getConfig,
  isValidPoint,
  reverseGeocode,
  searchPlaces,
  suggestPlaces,
} from "./services/estimate.service";
import {
  formatCurrency,
  formatDistance,
  formatDuration,
  formatPoint,
  whatsappLinks,
} from "./utils/format";
import {
  locationPrecision,
  locationWithFallback,
  locationWithMapFallback,
  normalizeMeraukeAddress,
  preferredLocationAddress,
  unnamedBuildingLabel,
} from "./utils/location-label";
import type {
  LocationPoint,
  Selection,
  UiState,
  Estimate,
  AppConfig,
  GeocodedPlace,
  BuildingFootprint,
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
const searchResultMode = ref<"suggestions" | "full">("suggestions");
const openingWhatsapp = ref(false);
const activeSuggestion = ref(-1);
const suggestionSettled = ref(false);
const showPlacePicker = ref(false);
const locatingInitialPickup = ref(false);
const placePicker = ref<HTMLElement>();
const searchInput = ref<HTMLInputElement>();
const recentLocations = ref<GeocodedPlace[]>([]);
const geocodeVersion: Record<Selection, number> = { pickup: 0, destination: 0 };
const recentLocationsKey = "antarfix:recent-locations:v1";
let searchVersion = 0;
let suggestionTimer: ReturnType<typeof setTimeout> | undefined;
let searchController: AbortController | undefined;
const suggestionCache = new Map<string, GeocodedPlace[]>();
let centerPreviewVersion = 0;
let centerPreviewTimer: ReturnType<typeof setTimeout> | undefined;
let whatsappFallbackTimer: number | undefined;
let whatsappOpeningResetTimer: number | undefined;
let whatsappVisibilityHandler: (() => void) | undefined;

const busy = computed(() => state.value === "calculating");
const ready = computed(() => !!pickup.value && !!destination.value && !busy.value);
const selectedCount = computed(
  () => Number(!!pickup.value) + Number(!!destination.value)
);
const showMobileAction = computed(
  () => !estimate.value && !manualOpen.value && !showPlacePicker.value
);
const showRecentLocations = computed(
  () => !searchQuery.value.trim() && !searchBusy.value && recentLocations.value.length > 0
);
const actionLabel = computed(() =>
  busy.value
    ? "Menghitung rute..."
    : locatingInitialPickup.value
    ? "Mencari lokasi Anda..."
    : selection.value === "pickup"
    ? "Gunakan lokasi jemput ini"
    : selection.value === "destination"
    ? "Gunakan tujuan ini"
    : !pickup.value
    ? "Pilih lokasi jemput"
    : !destination.value
    ? "Pilih tujuan"
    : error.value
    ? "Hitung ulang estimasi"
    : "Hitung estimasi"
);
const mobileActionHint = computed(() =>
  busy.value
    ? "Perjalananmu sedang dihitung"
    : selection.value === "pickup"
    ? "Geser peta sampai pin jemput tepat"
    : selection.value === "destination"
    ? "Geser peta sampai pin tujuan tepat"
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
const mobileSelectionLabel = computed(() =>
  selection.value === "pickup" ? "Lokasi jemput" : "Lokasi tujuan"
);
const mobileSelectionName = computed(() => {
  const target = selection.value;
  if (!target) return "";
  if (
    centerPreviewTarget.value === target &&
    centerPreviewPlace.value
  ) return centerPreviewPlace.value.name;
  if (resolvingCenterPreview.value) return "Mencari lokasi…";
  return target === "pickup" ? pickupDisplayName.value : destinationDisplayName.value;
});
const mobileSelectionAddress = computed(() => {
  const target = selection.value;
  if (!target) return "";
  if (
    centerPreviewTarget.value === target &&
    centerPreviewPlace.value
  ) return centerPreviewPlace.value.address;
  if (centerPreviewPoint.value) {
    return resolvingCenterPreview.value
      ? "Nama dan alamat akan muncul sesaat lagi"
      : formatPoint(centerPreviewPoint.value);
  }
  return "Geser peta sampai pin berada di lokasi yang tepat";
});
const bookingLinks = computed(() =>
  estimate.value && settings.value && pickup.value && destination.value
    ? whatsappLinks(
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

function clearWhatsappFallback() {
  if (whatsappFallbackTimer) clearTimeout(whatsappFallbackTimer);
  whatsappFallbackTimer = undefined;
  if (whatsappVisibilityHandler) {
    document.removeEventListener("visibilitychange", whatsappVisibilityHandler);
    window.removeEventListener("pagehide", whatsappVisibilityHandler);
  }
  whatsappVisibilityHandler = undefined;
}

function openBookingWhatsapp() {
  const links = bookingLinks.value;
  if (!links) return;
  openingWhatsapp.value = true;
  if (whatsappOpeningResetTimer) clearTimeout(whatsappOpeningResetTimer);
  whatsappOpeningResetTimer = window.setTimeout(() => {
    openingWhatsapp.value = false;
    whatsappOpeningResetTimer = undefined;
  }, 3000);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  if (!isMobile) {
    window.open(links.web, "_blank", "noopener,noreferrer");
    return;
  }

  clearWhatsappFallback();
  whatsappVisibilityHandler = () => {
    if (document.hidden) clearWhatsappFallback();
  };
  document.addEventListener("visibilitychange", whatsappVisibilityHandler);
  window.addEventListener("pagehide", whatsappVisibilityHandler);
  whatsappFallbackTimer = window.setTimeout(() => {
    const fallbackUrl = links.web;
    clearWhatsappFallback();
    if (!document.hidden) window.location.assign(fallbackUrl);
  }, 1400);
  window.location.assign(links.app);
}

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

function isStoredPlace(value: unknown): value is GeocodedPlace {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<GeocodedPlace>;
  return typeof place.name === "string"
    && typeof place.address === "string"
    && typeof place.lat === "number"
    && Number.isFinite(place.lat)
    && typeof place.lng === "number"
    && Number.isFinite(place.lng)
    && isValidPoint({ lat: place.lat, lng: place.lng });
}

function loadRecentLocations() {
  try {
    const stored = JSON.parse(localStorage.getItem(recentLocationsKey) || "[]");
    recentLocations.value = Array.isArray(stored)
      ? stored.filter(isStoredPlace).map(normalizeRecentLocation).slice(0, 5)
      : [];
    persistRecentLocations();
  } catch {
    recentLocations.value = [];
  }
}

function normalizeRecentLocation(place: GeocodedPlace): GeocodedPlace {
  const address = normalizeMeraukeAddress(place.address);
  const genericBuildingName = /^(?:titik di\s+)?bangunan dipilih$/i.test(place.name.trim());
  return {
    ...place,
    address,
    name: genericBuildingName ? unnamedBuildingLabel(address) : place.name,
  };
}

function persistRecentLocations() {
  try {
    localStorage.setItem(recentLocationsKey, JSON.stringify(recentLocations.value));
  } catch {
    // The estimator keeps working when private browsing blocks local storage.
  }
}

function rememberRecentLocation(place: GeocodedPlace) {
  if (locationPrecision(place) === "approximate") return;
  const storedPlace = normalizeRecentLocation({
    id: place.id,
    lat: place.lat,
    lng: place.lng,
    name: place.name,
    address: place.address,
    type: place.type,
    iconType: place.iconType,
    source: place.source,
    verified: place.verified,
  });
  const sameLocation = (item: GeocodedPlace) =>
    Math.abs(item.lat - storedPlace.lat) < 0.00001
    && Math.abs(item.lng - storedPlace.lng) < 0.00001;
  recentLocations.value = [
    storedPlace,
    ...recentLocations.value.filter(item => !sameLocation(item)),
  ].slice(0, 5);
  persistRecentLocations();
}

function isRecentLocationSelected(place: GeocodedPlace): boolean {
  const point = searchTarget.value === "pickup" ? pickup.value : destination.value;
  return !!point
    && Math.abs(point.lat - place.lat) < 0.00001
    && Math.abs(point.lng - place.lng) < 0.00001;
}

function clearRecentLocations() {
  recentLocations.value = [];
  try {
    localStorage.removeItem(recentLocationsKey);
  } catch {
    // Nothing else is required when local storage is unavailable.
  }
}

function locationStatus(target: Selection) {
  const point = target === "pickup" ? pickup.value : destination.value;
  const place = target === "pickup" ? pickupPlace.value : destinationPlace.value;
  if (!point) return null;
  if (resolvingPlace.value[target]) {
    return { kind: "loading", text: "Memeriksa nama dan ketepatan lokasi…" };
  }
  const precision = locationPrecision(place);
  if (precision === "road") {
    return {
      kind: "warning",
      text: "Lokasi masih berupa area jalan. Geser pin ke bangunan yang tepat.",
    };
  }
  if (precision === "approximate") {
    return {
      kind: "warning",
      text: "Lokasi belum spesifik. Geser pin ke bangunan yang tepat.",
    };
  }
  return null;
}

onMounted(() => {
  loadRecentLocations();
  void initializeApp();
});

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
  searchResultMode.value = "suggestions";
  activeSuggestion.value = -1;
  suggestionSettled.value = false;
  suggestionCache.clear();
  manualLat.value = "";
  manualLng.value = "";
  manualError.value = "";
  showPlacePicker.value = true;
  await nextTick();
  searchInput.value?.focus({ preventScroll: true });
}

function cancelPlaceSearch() {
  searchVersion++;
  if (suggestionTimer) clearTimeout(suggestionTimer);
  suggestionTimer = undefined;
  searchController?.abort();
  searchController = undefined;
  searchBusy.value = false;
  activeSuggestion.value = -1;
}

function closePlacePicker() {
  cancelPlaceSearch();
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
  if (normalizedPlace) rememberRecentLocation(normalizedPlace);
}

function placeWithBuilding(
  point: LocationPoint,
  target: Selection,
  place: GeocodedPlace | null,
  building: BuildingFootprint | null,
  preferPlaceName = false
): GeocodedPlace | null {
  const normalized = preferPlaceName
    ? locationWithFallback(place, target)
    : locationWithMapFallback(point, place, target);
  if (!building) return normalized;
  const buildingName = building.name?.trim();
  const address = preferredLocationAddress(
    building.address,
    normalized?.address,
    formatPoint(point),
  );
  return {
    ...(normalized || {
      ...point,
      address: formatPoint(point),
    }),
    name:
      (preferPlaceName ? normalized?.name : "") ||
      buildingName ||
      unnamedBuildingLabel(address),
    address,
    geometry: building.geometry,
    geometryKind: building.kind,
  };
}

async function resolvePlace(
  point: LocationPoint,
  target: Selection,
  version: number,
  preserveExistingPlace = false,
) {
  resolvingPlace.value[target] = true;
  try {
    const [placeResult, buildingResult] = await Promise.allSettled([
      reverseGeocode(point),
      getBuildingAt(point),
    ]);
    if (geocodeVersion[target] === version) {
      const existing = target === "pickup" ? pickupPlace.value : destinationPlace.value;
      const place = placeResult.status === "fulfilled" ? placeResult.value : null;
      const building = buildingResult.status === "fulfilled" ? buildingResult.value : null;
      const resolvedPlace = preserveExistingPlace && existing ? existing : place || existing;
      setPlace(target, placeWithBuilding(
        point,
        target,
        resolvedPlace,
        building,
        preserveExistingPlace && !!existing,
      ));
    }
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
  centerPreviewPoint.value = null;
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
  let building: BuildingFootprint | null = null;
  let place: GeocodedPlace | null = null;
  let buildingSettled = false;
  let placeSettled = false;
  const isCurrent = () => centerPreviewVersion === version && selection.value === target;
  const applyPreview = () => {
    if (!isCurrent()) return;
    const resolved = placeWithBuilding(point, target, place, building);
    if (resolved || (buildingSettled && placeSettled)) centerPreviewPlace.value = resolved;
    resolvingCenterPreview.value = !(buildingSettled && placeSettled);
  };

  void getBuildingAt(point)
    .then(result => { building = result; })
    .catch(() => { building = null; })
    .finally(() => {
      buildingSettled = true;
      applyPreview();
    });

  centerPreviewTimer = setTimeout(() => {
    void reverseGeocode(point)
      .then(result => { place = result; })
      .catch(() => { place = null; })
      .finally(() => {
        placeSettled = true;
        applyPreview();
      });
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
  if (!selectedPlace?.geometry) void resolvePlace(point, target, version, !!knownPlace);
  clearCenterPreview();
  estimate.value = null;
  error.value = "";
  manualError.value = "";
  // Keep the map still when moving from pickup to destination, including marker drags.
  if (target === "pickup" && !destination.value) startSelection("destination", false);
  else if (target === "destination" && !pickup.value) startSelection("pickup", false);
  else {
    selection.value = null;
    state.value = "idle";
  }
}

function searchFocus() {
  return searchTarget.value === "destination"
    ? pickup.value || deviceLocation.value
    : deviceLocation.value || pickup.value;
}

function suggestionCacheKey(query: string) {
  const focus = searchFocus();
  const locationKey = focus ? `${focus.lat.toFixed(3)},${focus.lng.toFixed(3)}` : "center";
  return `${searchTarget.value}:${locationKey}:${query.toLocaleLowerCase("id")}`;
}

async function loadPlaceSuggestions(query: string) {
  const cacheKey = suggestionCacheKey(query);
  const cached = suggestionCache.get(cacheKey);
  if (cached) {
    searchResults.value = cached;
    searchResultMode.value = "suggestions";
    activeSuggestion.value = -1;
    suggestionSettled.value = true;
    return;
  }
  const version = ++searchVersion;
  searchController?.abort();
  searchController = new AbortController();
  searchBusy.value = true;
  searchError.value = "";
  try {
    const results = await suggestPlaces(query, searchFocus(), searchController.signal);
    if (searchVersion !== version) return;
    searchResults.value = results;
    searchResultMode.value = "suggestions";
    activeSuggestion.value = -1;
    suggestionCache.set(cacheKey, results);
    if (suggestionCache.size > 50) suggestionCache.delete(suggestionCache.keys().next().value!);
  } catch (failure) {
    if (searchVersion !== version || (failure instanceof Error && failure.name === "AbortError")) return;
    searchError.value = failure instanceof Error ? failure.message : "Saran lokasi belum dapat dimuat.";
  } finally {
    if (searchVersion === version) {
      searchBusy.value = false;
      searchController = undefined;
      suggestionSettled.value = true;
    }
  }
}

function queuePlaceSuggestions() {
  if (suggestionTimer) clearTimeout(suggestionTimer);
  suggestionTimer = undefined;
  searchController?.abort();
  searchController = undefined;
  searchVersion++;
  searchError.value = "";
  searchResultMode.value = "suggestions";
  suggestionSettled.value = false;
  searchBusy.value = false;
  activeSuggestion.value = -1;
  const query = searchQuery.value.trim();
  if (!showPlacePicker.value || query.length < 2) {
    searchResults.value = [];
    return;
  }
  const cached = suggestionCache.get(suggestionCacheKey(query));
  if (cached) {
    searchResults.value = cached;
    suggestionSettled.value = true;
    return;
  }
  searchResults.value = [];
  suggestionTimer = setTimeout(() => {
    suggestionTimer = undefined;
    void loadPlaceSuggestions(query);
  }, 300);
}

async function submitPlaceSearch() {
  const query = searchQuery.value.trim();
  if (suggestionTimer) clearTimeout(suggestionTimer);
  suggestionTimer = undefined;
  searchController?.abort();
  searchController = new AbortController();
  const version = ++searchVersion;
  searchError.value = "";
  searchResultMode.value = "full";
  suggestionSettled.value = false;
  if (query.length < 3) {
    searchError.value = "Masukkan minimal 3 karakter.";
    searchController = undefined;
    return;
  }
  searchBusy.value = true;
  try {
    const results = await searchPlaces(query, searchFocus(), searchController.signal);
    if (searchVersion !== version) return;
    searchResults.value = results;
    searchResultMode.value = "full";
    activeSuggestion.value = -1;
    if (!searchResults.value.length)
      searchError.value =
        "Tempat belum ditemukan. Coba nama atau alamat yang lebih lengkap.";
  } catch (failure) {
    if (searchVersion !== version || (failure instanceof Error && failure.name === "AbortError")) return;
    searchError.value =
      failure instanceof Error ? failure.message : "Pencarian lokasi belum berhasil.";
  } finally {
    if (searchVersion === version) {
      searchBusy.value = false;
      searchController = undefined;
    }
  }
}

function moveSuggestion(direction: 1 | -1) {
  if (!searchResults.value.length) return;
  activeSuggestion.value = activeSuggestion.value < 0
    ? direction === 1 ? 0 : searchResults.value.length - 1
    : (activeSuggestion.value + direction + searchResults.value.length) % searchResults.value.length;
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveSuggestion(event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Enter" && activeSuggestion.value >= 0) {
    event.preventDefault();
    const place = searchResults.value[activeSuggestion.value];
    if (place) void selectSearchResult(place);
  } else if (event.key === "Escape" && searchResults.value.length) {
    event.stopPropagation();
    searchResults.value = [];
    activeSuggestion.value = -1;
  }
}

function highlightedName(name: string) {
  const query = searchQuery.value.trim().toLocaleLowerCase("id");
  const normalizedName = name.toLocaleLowerCase("id");
  const index = query ? normalizedName.indexOf(query) : -1;
  if (index < 0) return [{ text: name, match: false }];
  return [
    { text: name.slice(0, index), match: false },
    { text: name.slice(index, index + query.length), match: true },
    { text: name.slice(index + query.length), match: false },
  ].filter(part => part.text);
}

function suggestionDistance(place: GeocodedPlace) {
  if (place.distanceMeters === undefined) return "";
  const distance = place.distanceMeters < 1_000
    ? `${Math.round(place.distanceMeters)} m`
    : `${(place.distanceMeters / 1_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} km`;
  if (searchTarget.value === "destination" && pickup.value) return `${distance} dari lokasi jemput`;
  if (deviceLocation.value) return `${distance} dari lokasi Anda`;
  return distance;
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

async function selectRecentLocation(place: GeocodedPlace) {
  await selectSearchResult(place);
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
  cancelPlaceSearch();
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

onBeforeUnmount(() => {
  clearCenterPreview();
  cancelPlaceSearch();
  clearWhatsappFallback();
  if (whatsappOpeningResetTimer) clearTimeout(whatsappOpeningResetTimer);
});
</script>

<template>
  <div
    class="site-shell"
    :class="{
      'with-mobile-action': showMobileAction,
      'with-mobile-selection': showMobileAction && !!selection,
    }"
  >
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
            perangkat sebagai lokasi awal. Tekan Hitung estimasi setelah lokasi jemput dan tujuan dipilih;
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
              <span class="location-count">{{ selectedCount }}/2 lokasi</span>
            </div>
            <p class="card-subtitle">Cari nama tempat atau pilih langsung dari peta.</p>
            <div class="location-fields">
              <div class="point-connector" />
              <div class="location-row">
                <span class="point-badge point-pickup" aria-hidden="true">
                  <LocationMarkerGlyph target="pickup" :size="16" />
                </span>
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
                  <p
                    v-if="locationStatus('pickup')"
                    class="location-status"
                    :class="`is-${locationStatus('pickup')?.kind}`"
                    role="status"
                  >
                    <LoaderCircle
                      v-if="locationStatus('pickup')?.kind === 'loading'"
                      :size="12"
                      class="spinner"
                    /><Info v-else :size="12" />
                    <span>{{ locationStatus('pickup')?.text }}</span>
                  </p>
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
                <span class="point-badge point-destination" aria-hidden="true">
                  <LocationMarkerGlyph target="destination" :size="16" />
                </span>
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
                  <p
                    v-if="locationStatus('destination')"
                    class="location-status"
                    :class="`is-${locationStatus('destination')?.kind}`"
                    role="status"
                  >
                    <LoaderCircle
                      v-if="locationStatus('destination')?.kind === 'loading'"
                      :size="12"
                      class="spinner"
                    /><Info v-else :size="12" />
                    <span>{{ locationStatus('destination')?.text }}</span>
                  </p>
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
              <button
                v-if="bookingLinks"
                type="button"
                class="whatsapp-button"
                :disabled="openingWhatsapp"
                @click="openBookingWhatsapp"
              >
                <LoaderCircle v-if="openingWhatsapp" :size="22" class="spinner whatsapp-brand-icon" />
                <WhatsAppIcon v-else :size="22" class="whatsapp-brand-icon" />
                <span aria-live="polite">{{ openingWhatsapp ? "Membuka WhatsApp…" : "Lanjutkan di WhatsApp" }}</span>
              </button>
              <button v-else class="whatsapp-button" disabled>
                <WhatsAppIcon :size="22" class="whatsapp-brand-icon" /> Lanjutkan di WhatsApp
              </button>
              <p v-if="!bookingLinks" class="booking-note">
                {{
                  settings
                    ? "Pemesanan tersedia setelah nomor WhatsApp AntarFix dikonfigurasi."
                    : "Informasi pemesanan belum dapat dimuat."
                }}
              </p>
              <p v-else class="whatsapp-helper">Pesan dan detail perjalanan sudah disiapkan.</p>
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
            :pickup-place="pickupPlace"
            :destination-place="destinationPlace"
            :preview-point="centerPreviewPoint"
            :preview-place="centerPreviewPlace"
            :preview-target="centerPreviewTarget"
            :selection="selection"
            :estimate="estimate"
            :busy="busy"
            @choose="choose"
            @preview="previewCenter"
            @preview-start="startCenterPreview"
            @located="deviceLocation = $event"
          />
          <!-- <div class="map-caption"><span>Jarak mengikuti rute jalan.</span></div> -->
        </div>
      </div>

      <div class="closing-line">
        <Package :size="16" /><span>Dari lokasi jemput ke tujuan, AntarFix bantu hitungkan.</span>
      </div>
    </main>

    <footer>
      <a class="footer-brand" href="/">AntarFix<span> Estimator</span></a>
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
              :class="searchTarget === 'pickup' ? 'point-pickup' : 'point-destination'"
              aria-hidden="true"
              ><LocationMarkerGlyph :target="searchTarget" :size="18" />
            </span>
            <div>
              <h2 id="place-picker-title">
                {{
                  searchTarget === "pickup" ? "Pilih lokasi jemput" : "Pilih tujuan"
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
            <div class="place-search-input">
              <Search :size="17" /><input
                ref="searchInput"
                id="place-query"
                v-model="searchQuery"
                type="search"
                maxlength="120"
                autocomplete="off"
                placeholder="Contoh: Warung Mie Ayam"
                role="combobox"
                aria-autocomplete="list"
                aria-controls="place-search-results"
                :aria-expanded="searchResults.length > 0"
                :aria-activedescendant="activeSuggestion >= 0 ? `place-suggestion-${activeSuggestion}` : undefined"
                :disabled="busy"
                @input="queuePlaceSuggestions"
                @keydown="handleSearchKeydown"
              />
            </div>
            <button
              type="submit"
              class="search-button"
              :disabled="busy || (searchBusy && searchResultMode === 'full')"
              aria-label="Cari lokasi"
            >
              <LoaderCircle v-if="searchBusy" :size="18" class="spinner" /><Search
                v-else
                :size="18"
              /><span>Cari</span>
            </button>
          </div>
          <p v-if="searchBusy" class="search-status" role="status" aria-live="polite">
            {{ searchResultMode === "suggestions" ? "Mencari tempat…" : "Mencari lokasi di sekitar area layanan…" }}
          </p>
          <p v-else-if="searchError" class="search-message" role="status">
            {{ searchError }} Pilih langsung di peta jika lokasinya belum terdaftar.
          </p>
          <div v-if="searchResults.length" class="search-results-meta">
            <strong>{{ searchResults.length }} tempat ditemukan</strong>
            <span v-if="searchResultMode === 'full'">Pilih lokasi yang paling sesuai</span>
          </div>
          <ul
            v-if="searchResults.length"
            id="place-search-results"
            class="search-results"
            role="listbox"
            aria-label="Hasil pencarian lokasi"
          >
            <li
              v-for="(place, placeIndex) in searchResults"
              :id="`place-suggestion-${placeIndex}`"
              :key="`${place.lat},${place.lng},${place.name}`"
              role="option"
              :aria-selected="placeIndex === activeSuggestion"
            >
              <button
                type="button"
                :class="{ active: placeIndex === activeSuggestion }"
                @mouseenter="activeSuggestion = placeIndex"
                @click="selectSearchResult(place)"
              >
                <span class="search-result-icon" :class="`search-category-${place.type || 'other'}`"><PlaceIconGlyph :type="place.iconType || place.type" :category="place.type" :size="16" /></span
                ><span
                  ><strong><template v-for="(part, partIndex) in highlightedName(place.name)" :key="partIndex"><span v-if="part.match" class="search-match">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></strong
                  ><small>{{ place.address }}</small
                  ></span
                ><span v-if="suggestionDistance(place)" class="search-distance">{{ suggestionDistance(place) }}</span>
              </button>
            </li>
          </ul>
          <div v-else-if="suggestionSettled && !searchError && searchResultMode === 'suggestions' && searchQuery.trim().length >= 2" class="search-empty-state">
            <p>Belum ada tempat yang cocok di daftar lokal.</p>
            <button v-if="searchQuery.trim().length >= 3" type="button" @click="submitPlaceSearch">Cari lebih luas</button>
            <small v-else>Lanjutkan mengetik untuk pencarian lebih luas.</small>
          </div>
        </form>

        <button type="button" class="pick-map-button" @click="pickOnMap">
          <MapIcon :size="19" aria-hidden="true" />
          <strong>Pilih titik di peta</strong>
          <ChevronRight :size="17" aria-hidden="true" />
        </button>

        <section v-if="showRecentLocations" class="recent-locations" aria-labelledby="recent-locations-title">
          <div class="recent-locations-header">
            <strong id="recent-locations-title">Terakhir digunakan</strong>
            <button type="button" @click="clearRecentLocations">Hapus riwayat</button>
          </div>
          <ul class="search-results recent-location-list">
            <li
              v-for="place in recentLocations"
              :key="`recent-${place.lat},${place.lng},${place.name}`"
            >
              <button
                type="button"
                :class="{ selected: isRecentLocationSelected(place) }"
                :aria-current="isRecentLocationSelected(place) ? 'true' : undefined"
                @click="selectRecentLocation(place)"
              >
                <span
                  class="search-result-icon recent-location-icon"
                  :class="`search-category-${place.type || 'other'}`"
                  ><PlaceIconGlyph :type="place.iconType || place.type" :category="place.type" :size="17" /></span
                ><span
                  ><strong>{{ place.name }}</strong
                  ><small>{{ place.address }}</small></span
                ><Check v-if="isRecentLocationSelected(place)" :size="17" class="recent-row-status" aria-label="Lokasi sedang dipilih" /><ChevronRight v-else :size="17" class="recent-row-chevron" aria-hidden="true" />
              </button>
            </li>
          </ul>
        </section>

        <details
          ref="manualDetails"
          class="manual-coordinates picker-manual"
          @toggle="toggleManual"
        >
          <summary><span>Masukkan koordinat</span><ChevronDown :size="15" /></summary>
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
              Gunakan sebagai {{ searchTarget === "pickup" ? "lokasi jemput" : "tujuan" }}
              <ArrowRight :size="15" />
            </button>
          </form>
        </details>
        <a
          class="search-attribution picker-attribution"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          >© OpenStreetMap contributors</a
        >
      </section>
    </div>

    <div
      v-if="showMobileAction"
      class="mobile-action-bar"
      :class="{ 'is-selecting': !!selection }"
      aria-label="Langkah berikutnya"
    >
      <div class="mobile-action-inner">
        <div
          v-if="selection"
          class="mobile-selection-summary"
          :class="`is-${selection}`"
          role="status"
          aria-live="polite"
          :aria-busy="resolvingCenterPreview"
        >
          <span class="mobile-selection-icon" aria-hidden="true">
            <LoaderCircle
              v-if="resolvingCenterPreview"
              :size="18"
              class="spinner"
            />
            <LocationMarkerGlyph v-else :target="selection" :size="18" />
          </span>
          <span class="mobile-selection-copy">
            <small>{{ mobileSelectionLabel }}</small>
            <strong>{{ mobileSelectionName }}</strong>
            <span>{{ mobileSelectionAddress }}</span>
          </span>
        </div>
        <div v-else class="mobile-action-meta">
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
