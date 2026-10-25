

import { supabase, checkDatabaseConnection } from '../../../../lib/supabase.js';
import { runPrediction, generatePrerenderedHTML } from '../../../../lib/prediction-engine.js';
import { securityMiddleware } from '../../../../middleware/security.js';

// Helper: Fetch weather data
async function fetchWeatherData(lat, lon) {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) {
    throw new Error('Weather API key not configured');
  }

  const url = `https://api.weatherapi.com/v1/forecast.json?key=${apiKey}&q=${lat},${lon}&days=2&hourly=1`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Transform to hourly timeline
  const hourlyData = [];
  if (data.forecast?.forecastday) {
    data.forecast.forecastday.forEach(day => {
      day.hour.forEach(hour => {
        hourlyData.push({
          time: hour.time,
          temp_c: hour.temp_c,
          condition: hour.condition?.text || '',
          precip_mm: hour.precip_mm || 0,
          snow_cm: hour.snow_cm || 0,
          gust_kph: hour.gust_kph || 0,
          wind_kph: hour.wind_kph || 0,
          ice_accumulation: hour.ice_accumulation || 0,
        });
      });
    });
  }

  return hourlyData;
}

// Main handler
export default async function handler(req, res) {
  // Apply security middleware
  await new Promise((resolve, reject) => {
    securityMiddleware.helmet(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  await new Promise((resolve, reject) => {
    securityMiddleware.cors(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  await new Promise((resolve, reject) => {
    securityMiddleware.sanitizeParams(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Apply rate limiting
  await new Promise((resolve, reject) => {
    securityMiddleware.rateLimit(req, res, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  try {
    // Note: In Vercel serverless functions, the route params are in req.query
    // But with the file structure api/predictions/[country]/[state]/[city].js
    // Vercel automatically maps them to req.query
    const { country, state, city } = req.query;

    // Validate and sanitize
    const sanitizedCountry = country?.toLowerCase().trim() || '';
    const sanitizedState = state?.toLowerCase().trim() || '';
    const sanitizedCity = city?.toLowerCase().trim() || '';

    if (!sanitizedCountry || !sanitizedState || !sanitizedCity) {
      return res.status(400).send('Missing required parameters');
    }

    // Query database
    const { data: location, error } = await supabase
      .from('locations')
      .select('*')
      .eq('country', sanitizedCountry)
      .eq('state', sanitizedState)
      .eq('location_name', sanitizedCity)
      .single();

    if (error || !location) {
      return res.status(404).send('Location not found');
    }

    // Fetch weather data
    const hourlyData = await fetchWeatherData(location.latitude, location.longitude);

    // Run prediction
    const prediction = runPrediction(
      hourlyData,
      location.region_type,
      location.readiness_index
    );

    // Generate pre-rendered HTML
    const html = generatePrerenderedHTML(
      location,
      prediction,
      sanitizedCity,
      sanitizedState
    );

    // Set security headers (additional layer)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

    return res.send(html);
  } catch (error) {
    console.error('Prediction error:', error);
    return res.status(500).send('Error processing prediction');
  }
}