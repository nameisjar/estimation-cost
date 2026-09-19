// Set deterministic non-secret configuration before config.ts loads .env.
// dotenv does not overwrite these values. This is only imported by npm test.
Object.assign(process.env, {
  NODE_ENV: 'test',
  PORT: '3000',
  OSRM_BASE_URL: 'https://router.project-osrm.org',
  OSRM_TIMEOUT_MS: '12000',
  GEOCODING_SEARCH_RADIUS_KM: '20',
  DATABASE_URL: '',
  SERVICE_AREA_CENTER_LAT: '-8.4932',
  SERVICE_AREA_CENTER_LNG: '140.4018',
  SERVICE_AREA_RADIUS_KM: '50',
  MAX_DELIVERY_DISTANCE_KM: '50',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX_REQUESTS: '60',
  BASE_FARE: '8000',
  INCLUDED_KM: '2',
  PRICE_PER_KM: '2500',
  MINIMUM_FARE: '8000',
  FRONTEND_URL: 'http://localhost:5173',
  WHATSAPP_NUMBER: '',
});
