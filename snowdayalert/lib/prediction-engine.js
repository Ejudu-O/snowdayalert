

/**
 * Snow Day Prediction Engine
 * Secure-by-Design: Pure functions, no side effects, input validation
 */

/**
 * Validate and sanitize inputs
 */
function validateInputs(hourlyData, regionType, readinessIndex) {
  if (!Array.isArray(hourlyData) || hourlyData.length === 0) {
    throw new Error('Invalid hourly data: must be non-empty array');
  }

  const validRegions = ['urban', 'suburban', 'rural'];
  if (!validRegions.includes(regionType)) {
    throw new Error(`Invalid regionType: must be one of ${validRegions.join(', ')}`);
  }

  const index = Number(readinessIndex);
  if (isNaN(index) || index < 1 || index > 5) {
    throw new Error('readinessIndex must be a number between 1 and 5');
  }

  return {
    regionType,
    readinessIndex: index
  };
}

/**
 * Extract commute window (4 AM - 8 AM)
 */
function extractCommuteWindow(hourlyData) {
  return hourlyData.filter(hour => {
    if (!hour.time) return false;
    const hourNum = new Date(hour.time).getHours();
    return hourNum >= 4 && hourNum < 8;
  });
}

/**
 * Track metrics from commute window
 */
function trackMetrics(commuteWindow) {
  let maxFreezingRain = 0;
  let totalSnowfall = 0;
  let maxWindGust = 0;
  let minTemp = Infinity;

  commuteWindow.forEach(hour => {
    // Freezing rain / ice accumulation
    if (hour.condition?.includes('freezing') || hour.condition?.includes('ice')) {
      maxFreezingRain = Math.max(maxFreezingRain, hour.precip_mm || 0);
    }
    if (hour.ice_accumulation) {
      maxFreezingRain = Math.max(maxFreezingRain, hour.ice_accumulation);
    }

    // Snowfall
    totalSnowfall += hour.snow_cm || 0;

    // Wind gusts
    if (hour.gust_kph) {
      maxWindGust = Math.max(maxWindGust, hour.gust_kph);
    }

    // Temperature for wind chill
    if (hour.temp_c !== undefined) {
      minTemp = Math.min(minTemp, hour.temp_c);
    }
  });

  return { maxFreezingRain, totalSnowfall, maxWindGust, minTemp };
}

/**
 * Calculate wind chill (simplified)
 */
function calculateWindChill(temp, windSpeed) {
  if (temp > 10) return temp;
  if (windSpeed < 4.8) return temp;
  
  // Simplified wind chill formula (valid for -50C to +10C)
  const windChill = 13.12 + 0.6215 * temp - 11.37 * Math.pow(windSpeed, 0.16) + 0.3965 * temp * Math.pow(windSpeed, 0.16);
  return Math.round(windChill * 10) / 10;
}

/**
 * Core prediction algorithm
 */
export function runPrediction(hourlyData, regionType, readinessIndex) {
  // Validate inputs
  const validated = validateInputs(hourlyData, regionType, readinessIndex);
  
  let score = 0;
  const sensitivityFactor = validated.readinessIndex / 3;

  // Extract commute window
  const commuteWindow = extractCommuteWindow(hourlyData);
  if (commuteWindow.length === 0) {
    return { score: 0, breakdown: [], alert: 'No commute window data available' };
  }

  // Track metrics
  const { maxFreezingRain, totalSnowfall, maxWindGust, minTemp } = trackMetrics(commuteWindow);
  
  const breakdown = [];

  // 1. Freezing rain override (+35 points)
  if (maxFreezingRain >= 2) {
    score += 35;
    breakdown.push({
      factor: 'Freezing Rain Accumulation',
      impact: '+35',
      detail: `${maxFreezingRain.toFixed(1)}mm detected (threshold: 2mm)`
    });
  }

  // 2. Blowing snow drift (+20 points)
  if (maxWindGust >= 45 && totalSnowfall > 0) {
    score += 20;
    breakdown.push({
      factor: 'Blowing Snow Drift',
      impact: '+20',
      detail: `Wind gust ${maxWindGust.toFixed(0)}km/h with ${totalSnowfall.toFixed(1)}cm snow`
    });
  }

  // 3. Wind chill exposure
  const avgWind = commuteWindow.reduce((sum, h) => sum + (h.wind_kph || 0), 0) / commuteWindow.length;
  const windChill = calculateWindChill(minTemp, avgWind);
  
  if (windChill <= -35) {
    score += 30;
    breakdown.push({
      factor: 'Extreme Wind Chill',
      impact: '+30',
      detail: `Wind chill ${windChill.toFixed(1)}°C (below -35°C threshold)`
    });
  } else if (windChill <= -25) {
    score += 15;
    breakdown.push({
      factor: 'Severe Wind Chill',
      impact: '+15',
      detail: `Wind chill ${windChill.toFixed(1)}°C (below -25°C threshold)`
    });
  }

  // 4. Regional modifiers
  if (regionType === 'urban') {
    score -= 15;
    breakdown.push({
      factor: 'Urban Environment',
      impact: '-15',
      detail: 'Faster plow response, improved road conditions'
    });
  } else if (regionType === 'rural') {
    score += 15;
    breakdown.push({
      factor: 'Rural Environment',
      impact: '+15',
      detail: 'Slower plow response, backroad drift risk'
    });
  }

  // 5. Apply sensitivity factor
  score = score * sensitivityFactor;

  // 6. Normalize to 0-99 range
  score = Math.min(Math.max(Math.round(score), 0), 99);

  // 7. Generate alerts
  const alerts = [];
  if (score >= 70) {
    alerts.push({
      level: 'high',
      message: '⚠️ High probability of school closure',
      icon: '🔴'
    });
  } else if (score >= 40) {
    alerts.push({
      level: 'moderate',
      message: '⚠️ Moderate probability - check back for updates',
      icon: '🟡'
    });
  } else {
    alerts.push({
      level: 'low',
      message: '✅ Low probability - school likely open',
      icon: '🟢'
    });
  }

  // 8. Confidence interval
  const confidenceInterval = {
    low: Math.max(0, score - 15),
    high: Math.min(99, score + 15)
  };

  return {
    score,
    breakdown,
    alerts,
    confidenceInterval,
    windChill: windChill.toFixed(1),
    metrics: {
      maxFreezingRain: maxFreezingRain.toFixed(1),
      totalSnowfall: totalSnowfall.toFixed(1),
      maxWindGust: maxWindGust.toFixed(0),
      minTemp: minTemp.toFixed(1)
    }
  };
}

/**
 * Generate pre-rendered HTML for SEO
 */
export function generatePrerenderedHTML(location, prediction, city, state) {
  const { score, alerts, breakdown } = prediction;
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Snow Day Tomorrow in ${city}, ${state}? ${location.school_board_name} Closure Odds</title>
    <meta name="description" content="Real-time snow day prediction for ${location.school_board_name} in ${city}, ${state}. ${score}% chance of closure based on hyper-local weather data.">
    <meta property="og:title" content="Snow Day Tomorrow in ${city}, ${state}? ${location.school_board_name} Closure Odds">
    <meta property="og:description" content="${score}% chance of school closure in ${city}, ${state}. Data from local weather stations and school board policies.">
    <link rel="canonical" href="${process.env.PUBLIC_URL || 'https://snowdayalert.com'}/predictions/${country}/${state}/${city.toLowerCase().replace(/\\s+/g, '-')}">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            background: linear-gradient(to bottom, #e0f2fe, #bae6fd, #7dd3fc);
            min-height: 100vh;
            color: #0f172a;
        }
        .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
        .score-display { text-align: center; padding: 40px 20px; }
        .score-number { font-size: 5rem; font-weight: 800; letter-spacing: -2px; }
        .score-number.low { color: #059669; }
        .score-number.moderate { color: #d97706; }
        .score-number.high { color: #dc2626; }
        .breakdown { background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); border-radius: 20px; padding: 24px; margin-top: 20px; }
        .breakdown-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .alert { text-align: center; padding: 16px; border-radius: 12px; margin-top: 20px; }
        .alert.high { background: rgba(220,38,38,0.15); color: #dc2626; }
        .alert.moderate { background: rgba(217,119,6,0.15); color: #d97706; }
        .alert.low { background: rgba(5,150,105,0.15); color: #059669; }
        /* SEO Block */
        .seo-content { display: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="score-display">
            <h1>Snow Day Tomorrow in ${city}, ${state}</h1>
            <p>${location.school_board_name}</p>
            <div class="score-number ${score >= 70 ? 'high' : score >= 40 ? 'moderate' : 'low'}">${score}%</div>
            <p>Chance of school closure</p>
        </div>
        
        <div class="alert ${alerts[0]?.level || 'low'}">
            ${alerts[0]?.message || '✅ Low probability - school likely open'}
        </div>
        
        <div class="breakdown">
            <h3>Why This Score?</h3>
            ${breakdown.map(item => `
                <div class="breakdown-item">
                    <span>${item.factor}</span>
                    <span><strong>${item.impact}</strong></span>
                </div>
            `).join('')}
        </div>
        
        <div class="seo-content">
            <p>${city}, ${state} snow day forecast for ${location.school_board_name}.</p>
            <p>Based on hyper-local weather data and school board closure policies.</p>
            <p>Region type: ${location.region_type}</p>
            <p>Current probability: ${score}%</p>
        </div>
    </div>
    <script>
        // Hydration for canvas
        window.serverSnowCm = ${location.snow_depth || 0};
        window.serverRegionType = '${location.region_type}';
        window.serverSchoolBoard = '${location.school_board_name}';
        window.serverScore = ${score};
    </script>
    <script src="/snow-engine.js"></script>
</body>
</html>
  `;
}