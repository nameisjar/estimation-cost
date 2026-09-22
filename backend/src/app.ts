import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { config } from './config.js';
import { ApiError } from './errors.js';
import { OsrmProvider } from './services/routing/osrm.provider.js';
import { FallbackRoutingProvider } from './services/routing/fallback-routing.provider.js';
import { RoutingService } from './services/routing/routing.service.js';
import { PricingService } from './services/pricing/pricing.service.js';
import { estimateRoutes } from './routes/estimate.routes.js';
import { geocodingRoutes } from './routes/geocoding.routes.js';
import { NominatimProvider } from './services/geocoding/nominatim.provider.js';
import type { GeocodingProvider, RoutingProvider } from './types/index.js';
import { ServiceAreaService } from './services/service-area/service-area.service.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { databasePool } from './database.js';
import { PostgisPlaceRepository } from './services/places/postgis-place.repository.js';
import { SurveyFirstGeocodingProvider } from './services/geocoding/survey-first.provider.js';
import { placeRoutes } from './routes/place.routes.js';
import type { PlaceRepository } from './types/index.js';
import { AdminPlaceRepository } from './services/places/admin-place.repository.js';
import { AdminAuthService } from './services/admin/admin-auth.service.js';
import { adminRoutes } from './routes/admin.routes.js';
import { buildingRoutes } from './routes/building.routes.js';
import { PostgisBuildingRepository } from './services/buildings/postgis-building.repository.js';
import type { BuildingRepository } from './types/index.js';

function createNominatimProvider(): GeocodingProvider {
  return new NominatimProvider(
    config.geocodingBaseUrl,
    config.geocodingTimeoutMs,
    config.geocodingUserAgent,
    config.frontendUrl,
    { searchRadiusKm: config.geocodingSearchRadiusKm, serviceLimits: config.serviceLimits },
  );
}

function createRoutingProvider(): RoutingProvider {
  const primary = new OsrmProvider(config.osrmBaseUrl, config.osrmTimeoutMs);
  if (!config.osrmFallbackBaseUrl || config.osrmFallbackBaseUrl === config.osrmBaseUrl) return primary;
  return new FallbackRoutingProvider(
    primary,
    new OsrmProvider(config.osrmFallbackBaseUrl, config.osrmTimeoutMs),
  );
}

function createPlaceRepository(): PostgisPlaceRepository | undefined {
  return databasePool
    ? new PostgisPlaceRepository(
        databasePool,
        { lat: config.serviceLimits.centerLat, lng: config.serviceLimits.centerLng },
        config.serviceLimits.radiusKm,
      )
    : undefined;
}

function createAdminPlaceRepository(): AdminPlaceRepository | undefined {
  return databasePool ? new AdminPlaceRepository(databasePool) : undefined;
}

function createBuildingRepository(): BuildingRepository | undefined {
  return databasePool ? new PostgisBuildingRepository(databasePool) : undefined;
}

export function createApp(
  provider: RoutingProvider = createRoutingProvider(),
  geocodingProvider: GeocodingProvider = createNominatimProvider(),
  placeRepository: PlaceRepository | undefined = createPlaceRepository(),
  buildingRepository: BuildingRepository | undefined = createBuildingRepository(),
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(cors({ credentials: true, origin(origin, callback) {
    if (!origin || config.frontendUrls.includes(origin)) callback(null, true);
    else callback(new ApiError(403, 'ORIGIN_NOT_ALLOWED', 'Origin tidak diizinkan.'));
  } }));
  app.use(express.json({ limit: '8kb' }));
  app.get('/health', (_req, res) => { res.json({ success: true, message: 'AntarFix Estimator API is running' }); });
  app.use(['/api/buildings', '/api/locations'], createRateLimiter({
    windowMs: config.rateLimit.windowMs,
    maxRequests: Math.max(config.rateLimit.maxRequests * 4, 120),
  }));
  app.use('/api', buildingRoutes(buildingRepository, placeRepository));
  app.use('/api', createRateLimiter(config.rateLimit));
  app.get('/api/config', (_req, res) => { res.json({ success: true, data: { pricing: config.pricing, whatsappNumber: config.whatsappNumber, serviceArea: config.serviceLimits } }); });
  app.use('/api', estimateRoutes(new RoutingService(provider), new PricingService(config.pricing), new ServiceAreaService(config.serviceLimits)));
  const resolvedGeocoder = placeRepository
    ? new SurveyFirstGeocodingProvider(placeRepository, geocodingProvider)
    : geocodingProvider;
  app.use('/api', geocodingRoutes(resolvedGeocoder));
  app.use('/api', placeRoutes(placeRepository));
  app.use('/api', adminRoutes(
    createAdminPlaceRepository(),
    new AdminAuthService(config.admin),
    geocodingProvider,
    createPlaceRepository(),
  ));
  app.use((_req, res) => { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan.' } }); });
  const handleError: ErrorRequestHandler = (error, req, res, _next) => {
    if (error instanceof ApiError) { res.status(error.status).json({ success: false, error: { code: error.code, message: error.message } }); return; }
    const bodyError = error as { type?: string };
    if (bodyError.type === 'entity.parse.failed' || bodyError.type === 'entity.too.large') {
      const csvImport = req.path.startsWith('/api/admin/places/import/');
      res.status(bodyError.type === 'entity.too.large' ? 413 : 400).json({
        success: false,
        error: csvImport
          ? { code: 'INVALID_CSV', message: 'File harus berupa CSV yang valid.' }
          : { code: 'INVALID_BODY', message: 'Request harus berupa JSON valid dengan ukuran maksimal 8 KB.' },
      });
      return;
    }
    console.error('Unexpected API error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan. Silakan coba lagi.' } });
  };
  app.use(handleError);
  return app;
}
