

-- SnowDayAlert Database Schema
-- Migration: Initial schema creation

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Locations table
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_name VARCHAR(100) NOT NULL,
    state VARCHAR(50) NOT NULL,
    country VARCHAR(50) NOT NULL,
    postal_code VARCHAR(20),
    school_board_name VARCHAR(150) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    region_type VARCHAR(20) NOT NULL CHECK (region_type IN ('urban', 'suburban', 'rural')),
    readiness_index INTEGER NOT NULL DEFAULT 3 CHECK (readiness_index BETWEEN 1 AND 5),
    snow_depth DECIMAL(5, 2) DEFAULT 0,
    population INTEGER,
    elevation_meters INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- School boards table
CREATE TABLE IF NOT EXISTS school_boards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL UNIQUE,
    region_type VARCHAR(20) CHECK (region_type IN ('urban', 'suburban', 'rural')),
    windchill_threshold_celsius INTEGER,
    ice_accumulation_threshold_mm DECIMAL(3, 1),
    snow_depth_threshold_cm DECIMAL(4, 1),
    visibility_threshold_km DECIMAL(2, 1),
    historical_closure_sensitivity INTEGER DEFAULT 3 CHECK (historical_closure_sensitivity BETWEEN 1 AND 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Microclimate zones
CREATE TABLE IF NOT EXISTS microclimate_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    school_board_id UUID REFERENCES school_boards(id) ON DELETE CASCADE,
    zone_name VARCHAR(100) NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    elevation_meters INTEGER,
    is_airport_station BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Weather cache
CREATE TABLE IF NOT EXISTS weather_cache (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID REFERENCES locations(id) ON DELETE CASCADE,
    hourly_data JSONB NOT NULL,
    fetched_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE
);

-- User reports (anonymous)
CREATE TABLE IF NOT EXISTS user_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    reported_closure BOOLEAN,
    reported_date DATE DEFAULT CURRENT_DATE,
    report_source VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_locations_country_state_name ON locations (country, state, location_name);
CREATE INDEX idx_locations_coordinates ON locations (latitude, longitude);
CREATE INDEX idx_locations_region ON locations (region_type);
CREATE INDEX idx_locations_postal ON locations (postal_code);
CREATE INDEX idx_school_boards_name ON school_boards (name);
CREATE INDEX idx_weather_cache_location ON weather_cache (location_id);
CREATE INDEX idx_weather_cache_expires ON weather_cache (expires_at);
CREATE INDEX idx_user_reports_location_date ON user_reports (location_id, reported_date);

-- Update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Sample data (major cities)
INSERT INTO locations (location_name, state, country, school_board_name, latitude, longitude, region_type, readiness_index, population, elevation_meters)
VALUES 
    ('Denver', 'CO', 'USA', 'Denver Public Schools', 39.7392, -104.9903, 'urban', 3, 715522, 1609),
    ('Boulder', 'CO', 'USA', 'Boulder Valley School District', 40.0150, -105.2705, 'suburban', 4, 108250, 1655),
    ('Aspen', 'CO', 'USA', 'Aspen School District', 39.1911, -106.8175, 'rural', 5, 7004, 2405),
    ('Chicago', 'IL', 'USA', 'Chicago Public Schools', 41.8781, -87.6298, 'urban', 2, 2746388, 179),
    ('Toronto', 'ON', 'Canada', 'Toronto District School Board', 43.6532, -79.3832, 'urban', 3, 2930000, 76),
    ('Vancouver', 'BC', 'Canada', 'Vancouver School Board', 49.2827, -123.1207, 'urban', 3, 631486, 2)
ON CONFLICT DO NOTHING;

-- RLS (Row Level Security) Policies
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE microclimate_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

-- Read-only policies for public data
CREATE POLICY "Public read access to locations" ON locations
    FOR SELECT USING (true);

CREATE POLICY "Public read access to school_boards" ON school_boards
    FOR SELECT USING (true);

CREATE POLICY "Public read access to microclimate_zones" ON microclimate_zones
    FOR SELECT USING (true);

-- Write policies for anonymous reports
CREATE POLICY "Anonymous insert to user_reports" ON user_reports
    FOR INSERT WITH CHECK (true);