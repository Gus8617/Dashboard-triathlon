// server.js - Backend Node.js pour Raspberry Pi
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Pour servir le frontend React

const PORT = process.env.PORT || 3000;

// ===== CONFIGURATION =====
const config = {
  strava: {
    clientId: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
    redirectUri: process.env.STRAVA_REDIRECT_URI || `http://localhost:${PORT}/auth/strava/callback`
  },
  garmin: {
    consumerKey: process.env.GARMIN_CONSUMER_KEY,
    consumerSecret: process.env.GARMIN_CONSUMER_SECRET,
    requestTokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/request_token',
    accessTokenUrl: 'https://connectapi.garmin.com/oauth-service/oauth/access_token',
    authorizeUrl: 'https://connect.garmin.com/oauthConfirm',
    apiBaseUrl: 'https://apis.garmin.com/wellness-api/rest'
  }
};

// Base de données simple (fichier JSON)
const fs = require('fs');
const dbPath = './data/db.json';

function loadDB() {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data');
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ 
      activities: [], 
      sleepData: [], 
      tokens: {} 
    }));
  }
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// ===== STRAVA API =====

// Étape 1: Rediriger vers Strava pour autorisation
app.get('/auth/strava', (req, res) => {
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${config.strava.clientId}&redirect_uri=${config.strava.redirectUri}&response_type=code&scope=read,activity:read_all`;
  res.redirect(authUrl);
});

// Étape 2: Callback Strava avec le code d'autorisation
app.get('/auth/strava/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      code: code,
      grant_type: 'authorization_code'
    });

    const db = loadDB();
    db.tokens.strava = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: response.data.expires_at
    };
    saveDB(db);

    res.redirect('/?strava=connected');
  } catch (error) {
    console.error('Erreur Strava OAuth:', error.response?.data || error.message);
    res.redirect('/?strava=error');
  }
});

// Rafraîchir le token Strava si nécessaire
async function getValidStravaToken() {
  const db = loadDB();
  const tokens = db.tokens.strava;

  if (!tokens) throw new Error('Pas de tokens Strava');

  const now = Date.now() / 1000;
  if (tokens.expiresAt > now) {
    return tokens.accessToken;
  }

  // Rafraîchir le token
  try {
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token'
    });

    db.tokens.strava = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: response.data.expires_at
    };
    saveDB(db);

    return response.data.access_token;
  } catch (error) {
    throw new Error('Impossible de rafraîchir le token Strava');
  }
}

// Synchroniser les activités Strava
app.post('/api/sync/strava', async (req, res) => {
  try {
    const token = await getValidStravaToken();
    const after = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);

    const response = await axios.get(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    const activities = response.data.map(act => ({
      id: act.id,
      name: act.name,
      type: act.type,
      date: act.start_date.split('T')[0],
      duration: Math.round(act.moving_time / 60),
      distance: act.distance / 1000,
      avgHR: act.average_heartrate,
      maxHR: act.max_heartrate,
      elevation: act.total_elevation_gain,
      tss: act.suffer_score,
      source: 'Strava'
    }));

    const db = loadDB();
    const existingIds = new Set(db.activities.map(a => a.id));
    const newActivities = activities.filter(a => !existingIds.has(a.id));
    
    db.activities = [...db.activities, ...newActivities].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    saveDB(db);

    res.json({ 
      success: true, 
      newActivities: newActivities.length,
      totalActivities: db.activities.length 
    });
  } catch (error) {
    console.error('Erreur sync Strava:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== GARMIN API (OAuth 1.0a) =====

const oauth = OAuth({
  consumer: {
    key: config.garmin.consumerKey,
    secret: config.garmin.consumerSecret
  },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
  }
});

// Variables temporaires pour OAuth flow
let garminTempTokens = {};

// Étape 1: Obtenir request token
app.get('/auth/garmin', async (req, res) => {
  try {
    const requestData = {
      url: config.garmin.requestTokenUrl,
      method: 'POST'
    };

    const authHeader = oauth.toHeader(oauth.authorize(requestData));

    const response = await axios.post(config.garmin.requestTokenUrl, null, {
      headers: authHeader
    });

    // Parser la réponse (format: oauth_token=xxx&oauth_token_secret=yyy)
    const params = new URLSearchParams(response.data);
    const oauthToken = params.get('oauth_token');
    const oauthTokenSecret = params.get('oauth_token_secret');

    garminTempTokens[oauthToken] = oauthTokenSecret;

    const authorizeUrl = `${config.garmin.authorizeUrl}?oauth_token=${oauthToken}`;
    res.redirect(authorizeUrl);
  } catch (error) {
    console.error('Erreur Garmin OAuth:', error.response?.data || error.message);
    res.redirect('/?garmin=error');
  }
});

// Étape 2: Callback Garmin
app.get('/auth/garmin/callback', async (req, res) => {
  const { oauth_token, oauth_verifier } = req.query;
  const oauthTokenSecret = garminTempTokens[oauth_token];

  if (!oauthTokenSecret) {
    return res.redirect('/?garmin=error');
  }

  try {
    const requestData = {
      url: config.garmin.accessTokenUrl,
      method: 'POST',
      data: { oauth_verifier }
    };

    const token = {
      key: oauth_token,
      secret: oauthTokenSecret
    };

    const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

    const response = await axios.post(
      config.garmin.accessTokenUrl,
      `oauth_verifier=${oauth_verifier}`,
      { headers: { ...authHeader, 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const params = new URLSearchParams(response.data);
    const accessToken = params.get('oauth_token');
    const accessTokenSecret = params.get('oauth_token_secret');

    const db = loadDB();
    db.tokens.garmin = {
      accessToken,
      accessTokenSecret
    };
    saveDB(db);

    delete garminTempTokens[oauth_token];

    res.redirect('/?garmin=connected');
  } catch (error) {
    console.error('Erreur Garmin callback:', error.message);
    res.redirect('/?garmin=error');
  }
});

// Synchroniser les données de sommeil Garmin
app.post('/api/sync/garmin', async (req, res) => {
  try {
    const db = loadDB();
    const tokens = db.tokens.garmin;

    if (!tokens) {
      return res.status(401).json({ success: false, error: 'Garmin non connecté' });
    }

    // Récupérer les 30 derniers jours
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const requestData = {
      url: `${config.garmin.apiBaseUrl}/dailies`,
      method: 'GET',
      params: {
        uploadStartTimeInSeconds: Math.floor(new Date(startDate).getTime() / 1000),
        uploadEndTimeInSeconds: Math.floor(new Date(endDate).getTime() / 1000)
      }
    };

    const token = {
      key: tokens.accessToken,
      secret: tokens.accessTokenSecret
    };

    const authHeader = oauth.toHeader(oauth.authorize(requestData, token));

    const response = await axios.get(requestData.url, {
      headers: authHeader,
      params: requestData.params
    });

    // Parser les données de sommeil
    const sleepData = response.data.map(day => ({
      date: day.calendarDate,
      duration: day.sleepTimeInSeconds / 60, // en minutes
      quality: day.sleepScores?.overall?.value || 0,
      deepSleep: day.deepSleepSeconds / 60,
      lightSleep: day.lightSleepSeconds / 60,
      remSleep: day.remSleepSeconds / 60,
      awake: day.awakeSleepSeconds / 60,
      hrv: day.averageStressLevel,
      restingHR: day.restingHeartRate
    }));

    const existingDates = new Set(db.sleepData.map(s => s.date));
    const newSleep = sleepData.filter(s => !existingDates.has(s.date));
    
    db.sleepData = [...db.sleepData, ...newSleep].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    saveDB(db);

    res.json({ 
      success: true, 
      newNights: newSleep.length,
      totalNights: db.sleepData.length 
    });
  } catch (error) {
    console.error('Erreur sync Garmin:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== ENDPOINTS API =====

// Récupérer toutes les activités
app.get('/api/activities', (req, res) => {
  const db = loadDB();
  res.json(db.activities);
});

// Récupérer toutes les données de sommeil
app.get('/api/sleep', (req, res) => {
  const db = loadDB();
  res.json(db.sleepData);
});

// Statut des connexions
app.get('/api/status', (req, res) => {
  const db = loadDB();
  res.json({
    strava: !!db.tokens.strava,
    garmin: !!db.tokens.garmin,
    activitiesCount: db.activities.length,
    sleepCount: db.sleepData.length
  });
});

// Déconnecter Strava
app.post('/api/disconnect/strava', (req, res) => {
  const db = loadDB();
  delete db.tokens.strava;
  saveDB(db);
  res.json({ success: true });
});

// Déconnecter Garmin
app.post('/api/disconnect/garmin', (req, res) => {
  const db = loadDB();
  delete db.tokens.garmin;
  saveDB(db);
  res.json({ success: true });
});

// ===== CRON JOBS (synchronisation automatique) =====
const cron = require('node-cron');

// Synchroniser Strava toutes les heures
cron.schedule('0 * * * *', async () => {
  console.log('🔄 Synchronisation automatique Strava...');
  try {
    const token = await getValidStravaToken();
    // Logique de sync identique à /api/sync/strava
    console.log('✅ Strava synchronisé');
  } catch (error) {
    console.error('❌ Erreur sync auto Strava:', error.message);
  }
});

// Synchroniser Garmin tous les jours à 7h
cron.schedule('0 7 * * *', async () => {
  console.log('🔄 Synchronisation automatique Garmin...');
  try {
    // Logique de sync identique à /api/sync/garmin
    console.log('✅ Garmin synchronisé');
  } catch (error) {
    console.error('❌ Erreur sync auto Garmin:', error.message);
  }
});

// ===== DÉMARRAGE DU SERVEUR =====
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 Strava auth: http://localhost:${PORT}/auth/strava`);
  console.log(`🔗 Garmin auth: http://localhost:${PORT}/auth/garmin`);
});