# 📚 API Reference

## Endpoints

### Strava

#### `GET /auth/strava`
Initie le flow OAuth Strava.

#### `GET /auth/strava/callback`
Callback OAuth Strava.

#### `POST /api/sync/strava`
Synchronise les activités Strava.

**Response:**
```json
{
  "success": true,
  "newActivities": 5,
  "totalActivities": 156
}
```

### Garmin

#### `GET /api/garmin/status`
Vérifie la connexion Garmin.

**Response:**
```json
{
  "connected": true
}
```

#### `POST /api/sync/garmin`
Synchronise les données de sommeil.

**Response:**
```json
{
  "success": true,
  "newNights": 3,
  "totalNights": 30
}
```

### Data

#### `GET /api/activities`
Récupère toutes les activités.

**Response:**
```json
[
  {
    "id": 123456,
    "name": "Morning Run",
    "type": "run",
    "date": "2025-01-15",
    "duration": 60,
    "distance": 10.5,
    "avgHR": 145,
    "tss": 85
  }
]
```

#### `GET /api/sleep`
Récupère les données de sommeil.

**Response:**
```json
[
  {
    "date": "2025-01-15",
    "duration": 450,
    "quality": 85,
    "deepSleep": 120,
    "restingHR": 48
  }
]
```

#### `GET /api/status`
Statut global du système.

**Response:**
```json
{
  "strava": true,
  "garmin": true,
  "activitiesCount": 156,
  "sleepCount": 30
}
```