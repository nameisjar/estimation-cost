import { parse } from 'csv-parse/sync';
import { ApiError } from '../../errors.js';
import type { ServiceLimits } from '../../types/index.js';
import { directDistanceKm } from '../service-area/service-area.service.js';
import { classifyPlace } from './place-classification.js';
import type { SurveyPlaceInput } from './postgis-place.repository.js';
import { optionalNumber, resolvePlaceCoordinates } from '../../scripts/place-import-utils.js';

type CsvRow = Record<string, string>;
export type PlaceCsvImportMode = 'upsert' | 'insert-only';
export type PlaceCsvIssue = { row: number; name: string; message: string };
export type PlaceCsvWarning = PlaceCsvIssue;
export type PlaceCsvAdjustment = PlaceCsvIssue;
export type ParsedPlaceCsv = {
  totalRows: number;
  records: Array<{ row: number; place: SurveyPlaceInput }>;
  issues: PlaceCsvIssue[];
  invalidRows: number;
  correctedRows: number;
  corrections: PlaceCsvAdjustment[];
  mergedRows: number;
  merges: PlaceCsvAdjustment[];
  outsideServiceRows: number;
  warnings: PlaceCsvWarning[];
};
export type PlaceCsvPreview = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  newRows: number;
  updateRows: number;
  skippedRows: number;
  issues: PlaceCsvIssue[];
  correctedRows: number;
  corrections: PlaceCsvAdjustment[];
  mergedRows: number;
  merges: PlaceCsvAdjustment[];
  outsideServiceRows: number;
  warnings: PlaceCsvWarning[];
};
export type PlaceCsvImportResult = PlaceCsvPreview & { inserted: number; updated: number };

export interface SurveyPlaceImportRepository {
  classifySurveyPlace(place: SurveyPlaceInput): Promise<'inserted' | 'updated'>;
  importSurveyPlaces(
    places: SurveyPlaceInput[],
    mode: PlaceCsvImportMode,
  ): Promise<{ inserted: number; updated: number; skipped: number }>;
}

export const placeCsvColumns = [
  'placeId', 'name', 'category', 'address', 'latitude', 'longitude', 'rating',
  'reviewCount', 'phone', 'website', 'openingHours', 'googleMapsUrl',
  'searchKeyword', 'searchArea', 'collectedAt',
] as const;

const maximumIssues = 200;

function limited(value: string | undefined, field: string, row: number, maximum: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maximum) throw new Error(`Baris ${row}: ${field} maksimal ${maximum} karakter.`);
  return normalized;
}

function optionalUrl(value: string | undefined, field: string, row: number): string | undefined {
  const normalized = limited(value, field, row, 1_000);
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error(`Baris ${row}: ${field} harus berupa URL http/https yang valid.`);
  }
  return normalized;
}

function toPlace(record: CsvRow, row: number): {
  place: SurveyPlaceInput;
  correction?: 'google-maps-url' | 'swapped';
} {
  const name = limited(record.name, 'name', row, 160);
  if (!name) throw new Error(`Baris ${row}: name wajib diisi.`);
  const { lat, lng, correction } = resolvePlaceCoordinates(record, row);

  const rating = optionalNumber(record.rating, 'rating', row);
  const reviewCount = optionalNumber(record.reviewCount, 'reviewCount', row);
  if (rating !== undefined && (rating < 0 || rating > 5)) throw new Error(`Baris ${row}: rating harus 0 sampai 5.`);
  if (reviewCount !== undefined && (!Number.isSafeInteger(reviewCount) || reviewCount < 0)) {
    throw new Error(`Baris ${row}: reviewCount harus bilangan bulat positif.`);
  }
  const collectedAtText = limited(record.collectedAt, 'collectedAt', row, 80);
  const collectedAt = collectedAtText ? new Date(collectedAtText) : undefined;
  if (collectedAt && Number.isNaN(collectedAt.getTime())) throw new Error(`Baris ${row}: collectedAt bukan tanggal valid.`);

  const categoryInput = limited(record.category, 'category', row, 120) || '';
  const searchKeyword = limited(record.searchKeyword, 'searchKeyword', row, 160);
  const classification = classifyPlace(name, categoryInput, searchKeyword);
  return { place: {
    externalPlaceId: limited(record.placeId, 'placeId', row, 300),
    name,
    category: classification.category,
    iconType: classification.iconType,
    address: limited(record.address, 'address', row, 500),
    lat,
    lng,
    rating,
    reviewCount,
    phone: limited(record.phone, 'phone', row, 40),
    website: optionalUrl(record.website, 'website', row),
    openingHours: limited(record.openingHours, 'openingHours', row, 500),
    googleMapsUrl: optionalUrl(record.googleMapsUrl, 'googleMapsUrl', row),
    searchKeyword,
    searchArea: limited(record.searchArea, 'searchArea', row, 160),
    collectedAt,
  }, correction };
}

function newestDate(current?: Date, candidate?: Date): Date | undefined {
  if (!current) return candidate;
  if (!candidate) return current;
  return candidate.getTime() > current.getTime() ? candidate : current;
}

function maximumNumber(current?: number, candidate?: number): number | undefined {
  if (current === undefined) return candidate;
  if (candidate === undefined) return current;
  return Math.max(current, candidate);
}

function mergePlaces(current: SurveyPlaceInput, candidate: SurveyPlaceInput): SurveyPlaceInput {
  const aliases = new Set([...(current.aliases || []), ...(candidate.aliases || [])]);
  if (candidate.name.toLocaleLowerCase('id') !== current.name.toLocaleLowerCase('id')) aliases.add(candidate.name);
  return {
    ...current,
    externalPlaceId: current.externalPlaceId || candidate.externalPlaceId,
    category: !current.category || current.category === 'other' ? candidate.category : current.category,
    iconType: !current.iconType || current.iconType === 'other' ? candidate.iconType : current.iconType,
    aliases: [...aliases],
    address: current.address || candidate.address,
    rating: maximumNumber(current.rating, candidate.rating),
    reviewCount: maximumNumber(current.reviewCount, candidate.reviewCount),
    phone: current.phone || candidate.phone,
    website: current.website || candidate.website,
    openingHours: current.openingHours || candidate.openingHours,
    googleMapsUrl: current.googleMapsUrl || candidate.googleMapsUrl,
    searchKeyword: current.searchKeyword || candidate.searchKeyword,
    searchArea: current.searchArea || candidate.searchArea,
    collectedAt: newestDate(current.collectedAt, candidate.collectedAt),
  };
}

export function parsePlaceCsv(csv: string, limits: ServiceLimits): ParsedPlaceCsv {
  if (!csv.trim()) throw new ApiError(400, 'EMPTY_CSV', 'File CSV kosong.');
  let headers: string[] = [];
  let rows: CsvRow[];
  try {
    rows = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      columns(values: string[]) {
        headers = values.map(value => value.trim());
        return headers;
      },
    }) as CsvRow[];
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'struktur CSV tidak valid';
    throw new ApiError(400, 'INVALID_CSV', `CSV tidak dapat dibaca: ${detail}.`);
  }
  const missing = placeCsvColumns.filter(column => !headers.includes(column));
  if (missing.length) throw new ApiError(400, 'INVALID_CSV_COLUMNS', `Kolom CSV belum lengkap: ${missing.join(', ')}.`);
  if (!rows.length) throw new ApiError(400, 'EMPTY_CSV', 'CSV belum memiliki baris data.');
  const records: ParsedPlaceCsv['records'] = [];
  const issues: PlaceCsvIssue[] = [];
  const corrections: PlaceCsvAdjustment[] = [];
  const merges: PlaceCsvAdjustment[] = [];
  const warnings: PlaceCsvWarning[] = [];
  let invalidRows = 0;
  let correctedRows = 0;
  let mergedRows = 0;
  let outsideServiceRows = 0;
  const externalIdRows = new Map<string, ParsedPlaceCsv['records'][number]>();
  const placesByName = new Map<string, ParsedPlaceCsv['records']>();
  rows.forEach((record, index) => {
    const row = index + 2;
    try {
      const { place, correction } = toPlace(record, row);
      if (correction) {
        correctedRows++;
        if (corrections.length < maximumIssues) {
          corrections.push({
            row,
            name: place.name,
            message: correction === 'swapped'
              ? 'Latitude dan longitude tertukar lalu diperbaiki otomatis.'
              : 'Koordinat tidak valid lalu dipulihkan dari URL Google Maps.',
          });
        }
      }
      const duplicateExternalIdRow = place.externalPlaceId
        ? externalIdRows.get(place.externalPlaceId)
        : undefined;
      const normalizedName = place.name.toLocaleLowerCase('id');
      const duplicateName = placesByName.get(normalizedName)?.find(
        existing => directDistanceKm(existing.place, place) * 1_000 <= 20,
      );
      const duplicate = duplicateExternalIdRow ?? duplicateName;
      if (duplicate) {
        duplicate.place = mergePlaces(duplicate.place, place);
        mergedRows++;
        if (merges.length < maximumIssues) {
          merges.push({
            row,
            name: place.name,
            message: `Digabung otomatis dengan baris ${duplicate.row}; kolom kosong dilengkapi tanpa membuat tempat baru.`,
          });
        }
        if (place.externalPlaceId) externalIdRows.set(place.externalPlaceId, duplicate);
        const sameNamePlaces = placesByName.get(normalizedName);
        if (sameNamePlaces && !sameNamePlaces.includes(duplicate)) sameNamePlaces.push(duplicate);
        else if (!sameNamePlaces) placesByName.set(normalizedName, [duplicate]);
        return;
      }
      const parsedRecord = { row, place };
      records.push(parsedRecord);
      if (place.externalPlaceId) externalIdRows.set(place.externalPlaceId, parsedRecord);
      const sameNamePlaces = placesByName.get(normalizedName);
      if (sameNamePlaces) sameNamePlaces.push(parsedRecord);
      else placesByName.set(normalizedName, [parsedRecord]);
    } catch (error) {
      invalidRows++;
      if (issues.length < maximumIssues) {
        issues.push({
          row,
          name: record.name?.trim().slice(0, 160) || '(tanpa nama)',
          message: error instanceof Error ? error.message.replace(/^Baris \d+:\s*/, '') : 'Data tidak valid.',
        });
      }
    }
  });
  for (const record of records) {
    const fromServiceCenter = directDistanceKm(
      { lat: limits.centerLat, lng: limits.centerLng },
      record.place,
    );
    if (fromServiceCenter > limits.radiusKm) {
      outsideServiceRows++;
      if (warnings.length < maximumIssues) {
        warnings.push({
          row: record.row,
          name: record.place.name,
          message: `Berjarak ${fromServiceCenter.toFixed(1)} km dari pusat. Data tetap diimpor, tetapi berada di luar area layanan ${limits.radiusKm} km.`,
        });
      }
    }
  }
  return {
    totalRows: rows.length,
    records,
    issues,
    invalidRows,
    correctedRows,
    corrections,
    mergedRows,
    merges,
    outsideServiceRows,
    warnings,
  };
}

export class PlaceCsvImportService {
  constructor(
    private readonly repository: SurveyPlaceImportRepository,
    private readonly limits: ServiceLimits,
  ) {}

  async preview(csv: string, mode: PlaceCsvImportMode): Promise<PlaceCsvPreview> {
    const parsed = parsePlaceCsv(csv, this.limits);
    let newRows = 0;
    let updateRows = 0;
    for (let index = 0; index < parsed.records.length; index += 20) {
      const actions = await Promise.all(
        parsed.records.slice(index, index + 20).map(({ place }) => this.repository.classifySurveyPlace(place)),
      );
      newRows += actions.filter(action => action === 'inserted').length;
      updateRows += actions.filter(action => action === 'updated').length;
    }
    const invalidRows = parsed.invalidRows;
    return {
      totalRows: parsed.totalRows,
      validRows: parsed.records.length,
      invalidRows,
      newRows,
      updateRows,
      skippedRows: invalidRows + (mode === 'insert-only' ? updateRows : 0),
      issues: parsed.issues,
      correctedRows: parsed.correctedRows,
      corrections: parsed.corrections,
      mergedRows: parsed.mergedRows,
      merges: parsed.merges,
      outsideServiceRows: parsed.outsideServiceRows,
      warnings: parsed.warnings,
    };
  }

  async commit(csv: string, mode: PlaceCsvImportMode): Promise<PlaceCsvImportResult> {
    const parsed = parsePlaceCsv(csv, this.limits);
    const imported = await this.repository.importSurveyPlaces(parsed.records.map(record => record.place), mode);
    const invalidRows = parsed.invalidRows;
    return {
      totalRows: parsed.totalRows,
      validRows: parsed.records.length,
      invalidRows,
      newRows: imported.inserted,
      updateRows: imported.updated,
      skippedRows: invalidRows + imported.skipped,
      issues: parsed.issues,
      correctedRows: parsed.correctedRows,
      corrections: parsed.corrections,
      mergedRows: parsed.mergedRows,
      merges: parsed.merges,
      outsideServiceRows: parsed.outsideServiceRows,
      warnings: parsed.warnings,
      inserted: imported.inserted,
      updated: imported.updated,
    };
  }
}
