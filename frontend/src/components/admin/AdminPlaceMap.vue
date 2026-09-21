<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const props = defineProps<{ lat: number; lng: number }>();
const emit = defineEmits<{ change: [point: { lat: number; lng: number }] }>();
const container = ref<HTMLDivElement>();
let map: L.Map;
let marker: L.Marker;
let observer: ResizeObserver;

const pinIcon = L.divIcon({
  className: 'admin-map-pin-wrap',
  html: '<span class="admin-map-pin"><i></i></span>',
  iconSize: [34, 42],
  iconAnchor: [17, 39],
});

function move(point: L.LatLng, publish = true) {
  marker?.setLatLng(point);
  if (publish) emit('change', { lat: Number(point.lat.toFixed(7)), lng: Number(point.lng.toFixed(7)) });
}

onMounted(() => {
  map = L.map(container.value!, { zoomControl: false }).setView([props.lat, props.lng], 17);
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
  }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  marker = L.marker([props.lat, props.lng], { icon: pinIcon, draggable: true, title: 'Geser untuk mengubah koordinat' }).addTo(map);
  marker.on('dragend', () => move(marker.getLatLng()));
  map.on('click', event => move(event.latlng));
  observer = new ResizeObserver(() => map.invalidateSize());
  observer.observe(container.value!);
});

watch(() => [props.lat, props.lng], ([lat, lng]) => {
  if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  const current = marker.getLatLng();
  if (Math.abs(current.lat - lat) > 1e-7 || Math.abs(current.lng - lng) > 1e-7) {
    marker.setLatLng([lat, lng]);
    map.panTo([lat, lng]);
  }
});

onBeforeUnmount(() => { observer?.disconnect(); map?.remove(); });
</script>

<template><div ref="container" class="admin-place-map" aria-label="Peta pemilih koordinat" /></template>
