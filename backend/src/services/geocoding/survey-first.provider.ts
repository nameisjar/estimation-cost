import type { GeocodedPlace, GeocodingProvider, LocationPoint, PlaceRepository } from '../../types/index.js';

export class SurveyFirstGeocodingProvider implements GeocodingProvider {
  constructor(
    private readonly places: PlaceRepository,
    private readonly fallback: GeocodingProvider,
  ) {}

  async reverse(point: LocationPoint): Promise<GeocodedPlace | null> {
    try {
      const local = await this.places.nearest(point);
      if (local) return local;
    } catch (error) {
      console.error('PostGIS reverse lookup failed; using Nominatim fallback:', error);
    }
    return this.fallback.reverse(point);
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
