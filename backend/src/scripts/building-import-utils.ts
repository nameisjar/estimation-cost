import type { PlaceAreaGeometry } from '../types/index.js';

type OverpassCoordinate = { lat: number; lon: number };
type OverpassMember = { role?: string; geometry?: OverpassCoordinate[] };
export type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: OverpassCoordinate;
  timestamp?: string;
  tags?: Record<string, string>;
  geometry?: OverpassCoordinate[];
  members?: OverpassMember[];
};
export type BuildingImportRecord = {
  sourceId: string;
  name: string | null;
  address: string | null;
  buildingType: string;
  geometry: PlaceAreaGeometry;
  sourceUpdatedAt: string | null;
};
export type PoiImportRecord = {
  sourceId: string;
  name: string;
  category: string;
  address: string | null;
  lat: number;
  lng: number;
  sourceUpdatedAt: string | null;
};
export type AreaImportRecord = {
  sourceId: string;
  name: string | null;
  areaType: string;
  address: string | null;
  geometry: PlaceAreaGeometry;
  sourceUpdatedAt: string | null;
};

type Position = [number, number];

function samePosition(first: Position, second: Position): boolean {
  return first[0] === second[0] && first[1] === second[1];
}

function positions(value?: OverpassCoordinate[]): Position[] | null {
  if (!value?.length) return null;
  const result: Position[] = [];
  for (const coordinate of value) {
    if (!Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lon)) return null;
    const current: Position = [coordinate.lon, coordinate.lat];
    if (!result.length || !samePosition(result[result.length - 1]!, current)) result.push(current);
  }
  return result.length >= 2 ? result : null;
}

function closedRing(value?: OverpassCoordinate[]): Position[] | null {
  const ring = positions(value);
  if (!ring || ring.length < 4 || !samePosition(ring[0]!, ring[ring.length - 1]!)) return null;
  return ring;
}

function stitchRings(values: Array<OverpassCoordinate[] | undefined>): Position[][] {
  const segments = values.map(positions).filter((value): value is Position[] => !!value);
  const rings: Position[][] = [];
  while (segments.length) {
    let ring = segments.shift()!;
    let joined = true;
    while (!samePosition(ring[0]!, ring[ring.length - 1]!) && joined) {
      joined = false;
      for (let index = 0; index < segments.length; index++) {
        const segment = segments[index]!;
        const ringStart = ring[0]!;
        const ringEnd = ring[ring.length - 1]!;
        const segmentStart = segment[0]!;
        const segmentEnd = segment[segment.length - 1]!;
        if (samePosition(ringEnd, segmentStart)) ring = [...ring, ...segment.slice(1)];
        else if (samePosition(ringEnd, segmentEnd)) ring = [...ring, ...segment.slice(0, -1).reverse()];
        else if (samePosition(ringStart, segmentEnd)) ring = [...segment.slice(0, -1), ...ring];
        else if (samePosition(ringStart, segmentStart)) ring = [...segment.slice(1).reverse(), ...ring];
        else continue;
        segments.splice(index, 1);
        joined = true;
        break;
      }
    }
    if (ring.length >= 4 && samePosition(ring[0]!, ring[ring.length - 1]!)) rings.push(ring);
  }
  return rings;
}

function pointInRing(point: Position, ring: Position[]): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [x, y] = ring[current]!;
    const [previousX, previousY] = ring[previous]!;
    if ((y > point[1]) !== (previousY > point[1])
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x) inside = !inside;
  }
  return inside;
}

function relationGeometry(element: OverpassElement): PlaceAreaGeometry | null {
  const members = element.members || [];
  const outerRings = stitchRings(members.filter(member => member.role !== 'inner').map(member => member.geometry));
  if (!outerRings.length) return null;
  const innerRings = stitchRings(members.filter(member => member.role === 'inner').map(member => member.geometry));
  const polygons = outerRings.map(outer => [
    outer,
    ...innerRings.filter(inner => pointInRing(inner[0]!, outer)),
  ]);
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0]! }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function osmAddress(tags: Record<string, string>): string | null {
  const full = tags['addr:full']?.trim();
  if (full) return full;
  const street = [tags['addr:street']?.trim(), tags['addr:housenumber']?.trim()].filter(Boolean).join(' ');
  const parts = [street, tags['addr:suburb'], tags['addr:district'], tags['addr:city']]
    .map(value => value?.trim()).filter((value): value is string => !!value);
  return [...new Set(parts)].join(', ') || null;
}

const poiKeys = ['office', 'shop', 'amenity', 'tourism', 'healthcare', 'craft', 'leisure', 'historic', 'public_transport', 'railway'] as const;

const selectableAreaValues: Record<string, Set<string>> = {
  leisure: new Set(['pitch', 'park', 'sports_centre', 'stadium', 'playground', 'swimming_pool']),
  landuse: new Set(['recreation_ground', 'cemetery', 'retail', 'commercial', 'education', 'institutional']),
  amenity: new Set(['school', 'university', 'college', 'kindergarten', 'hospital', 'clinic', 'marketplace', 'parking', 'place_of_worship']),
  tourism: new Set(['attraction', 'hotel', 'museum']),
};

function elementGeometry(element: OverpassElement): PlaceAreaGeometry | null {
  if (element.type === 'node') return null;
  if (element.type === 'way') {
    const ring = closedRing(element.geometry);
    return ring ? { type: 'Polygon', coordinates: [ring] } : null;
  }
  return relationGeometry(element);
}

export function normalizeBuildingElement(element: OverpassElement): BuildingImportRecord | null {
  if (element.type === 'node' || !Number.isSafeInteger(element.id) || element.id < 1 || !element.tags?.building || element.tags.building === 'no') return null;
  const geometry = elementGeometry(element);
  if (!geometry) return null;
  return {
    sourceId: `${element.type}/${element.id}`,
    name: element.tags.name?.trim() || null,
    address: osmAddress(element.tags),
    buildingType: element.tags.building.trim() || 'yes',
    geometry,
    sourceUpdatedAt: element.timestamp || null,
  };
}

export function normalizeAreaElement(element: OverpassElement): AreaImportRecord | null {
  if (element.type === 'node' || !Number.isSafeInteger(element.id) || element.id < 1 || !element.tags) return null;
  const entry = Object.entries(selectableAreaValues)
    .find(([key, values]) => values.has(element.tags![key] || ''));
  if (!entry) return null;
  const geometry = elementGeometry(element);
  if (!geometry) return null;
  const [key] = entry;
  return {
    sourceId: `${element.type}/${element.id}`,
    name: element.tags.name?.trim() || null,
    areaType: `${key}:${element.tags[key]}`,
    address: osmAddress(element.tags),
    geometry,
    sourceUpdatedAt: element.timestamp || null,
  };
}

export function normalizePoiElement(element: OverpassElement): PoiImportRecord | null {
  const name = element.tags?.name?.trim();
  const key = poiKeys.find(candidate => element.tags?.[candidate] && element.tags[candidate] !== 'no');
  const coordinate = element.type === 'node'
    ? { lat: element.lat, lon: element.lon }
    : element.center;
  if (!name || !key || !Number.isSafeInteger(element.id) || element.id < 1
    || !Number.isFinite(coordinate?.lat) || !Number.isFinite(coordinate?.lon)) return null;
  return {
    sourceId: `${element.type}/${element.id}`,
    name,
    category: `${key}:${element.tags![key]}`,
    address: osmAddress(element.tags!),
    lat: coordinate!.lat!,
    lng: coordinate!.lon!,
    sourceUpdatedAt: element.timestamp || null,
  };
}
