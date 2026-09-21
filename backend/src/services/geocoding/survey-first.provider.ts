import type { GeocodedPlace, GeocodingProvider, LocationPoint, PlaceRepository } from '../../types/index.js';

export class SurveyFirstGeocodingProvider implements GeocodingProvider {
  constructor(
    private readonly places: PlaceRepository,
    private readonly fallback: GeocodingProvider,
  ) {}

  async reverse(point: LocationPoint, options: { includeGeometry?: boolean } = {}): Promise<GeocodedPlace | null> {
    try {
      const local = await this.places.nearest(point);
      if (local && !options.includeGeometry) return local;
      if (local) {
        try {
          const detail = await this.fallback.reverse(point, options);
          return detail?.geometry ? { ...local, geometry: detail.geometry } : local;
        } catch (error) {
          console.error('OSM building lookup failed; using surveyed place without geometry:', error);
          return local;
        }
      }
    } catch (error) {
      console.error('PostGIS reverse lookup failed; using Nominatim fallback:', error);
    }
    return this.fallback.reverse(point, options);
  }

  async search(query: string, near?: LocationPoint): Promise<GeocodedPlace[]> {
    try {
      const local = await this.places.search(query, near, 8);
      if (local.length) return local;
    } catch (error) {
      console.error('PostGIS place search failed; using Nominatim fallback:', error);
    }
    return this.fallback.search(query, near);
  }
}
