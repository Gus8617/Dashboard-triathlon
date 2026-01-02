// server.js - Backend Node.js pour Raspberry Pi
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GarminConnect } = require('garmin-connect');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

// ===== CONFIGURATION =====
const config = {
  strava: {
    clientId: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
    redirectUri: process.env.STRAVA_REDIRECT_URI || `http://localhost:${PORT}/auth/strava/callback`,
    refreshToken: process.env.STRAVA_REFRESH_TOKEN || null
  },
  garmin: {
    email: process.env.GARMIN_EMAIL,
    password: process.env.GARMIN_PASSWORD
  }
};

// Base de données simple (fichier JSON)
const fs = require('fs');
const dbPath = './data/db.json';

function loadDB() {
  if (!fs.existsSync('./data')) fs.mkdirSync('./data');
  if (!fs.existsSync(dbPath)) {
    const initialDB = { 
      activities: [], 
      sleepData: [], 
      tokens: {} 
    };
    fs.writeFileSync(dbPath, JSON.stringify(initialDB, null, 2));
    return initialDB;
  }
  try {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    if (!Array.isArray(data.activities)) data.activities = [];
    if (!Array.isArray(data.sleepData)) data.sleepData = [];
    if (!data.tokens) data.tokens = {};
    return data;
  } catch (error) {
    console.error('Erreur lecture DB:', error);
    return { activities: [], sleepData: [], tokens: {} };
  }
}

function saveDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// ===== STRAVA API =====

app.get('/auth/strava', (req, res) => {
  const authUrl = `https://www.strava.com/oauth/authorize?client_id=${config.strava.clientId}&redirect_uri=${config.strava.redirectUri}&response_type=code&scope=read,activity:read_all`;
  res.redirect(authUrl);
});

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

async function getValidStravaToken() {
  const db = loadDB();
  let tokens = db.tokens.strava;

  // Si pas de token en DB, utiliser celui du .env
  if (!tokens && config.strava.refreshToken) {
    console.log('ℹ️ Utilisation du refresh token depuis .env');
    tokens = {
      refreshToken: config.strava.refreshToken,
      expiresAt: 0 // Forcera un refresh immédiat
    };
  }

  if (!tokens) throw new Error('Pas de tokens Strava (ni DB ni .env)');

  const now = Date.now() / 1000;
  
  // Si le token est encore valide, le retourner
  if (tokens.accessToken && tokens.expiresAt > now) {
    return tokens.accessToken;
  }

  // Rafraîchir le token
  console.log('🔄 Rafraîchissement du token Strava...');
  try {
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: config.strava.clientId,
      client_secret: config.strava.clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token'
    });

    console.log('✅ Token Strava rafraîchi avec succès');

    // Sauvegarder le nouveau token en DB
    db.tokens.strava = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      expiresAt: response.data.expires_at
    };
    saveDB(db);

    return response.data.access_token;
  } catch (error) {
    console.error('❌ Erreur refresh token:', error.response?.data || error.message);
    throw new Error('Impossible de rafraîchir le token Strava: ' + (error.response?.data?.message || error.message));
  }
}

app.post('/api/sync/strava', async (req, res) => {
  console.log('📥 Début synchronisation Strava...');
  
  try {
    // Vérifier si un token existe (DB ou .env)
    let db = loadDB();
    if (!db.tokens.strava && !config.strava.refreshToken) {
      console.error('❌ Aucun token Strava configuré');
      return res.status(401).json({ 
        success: false, 
        error: 'Veuillez d\'abord connecter votre compte Strava ou configurer STRAVA_REFRESH_TOKEN dans .env',
        needsAuth: true
      });
    }

    const token = await getValidStravaToken();
    console.log('✓ Token Strava obtenu');
    
    const after = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    
    const response = await axios.get(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    console.log(`✓ ${response.data.length} activités récupérées de Strava`);

    const activities = response.data.map(act => {
      let activityType = 'run';
      if (act.type === 'Ride' || act.type === 'VirtualRide' || act.type === 'EBikeRide') {
        activityType = 'bike';
      } else if (act.type === 'Run' || act.type === 'VirtualRun') {
        activityType = 'run';
      } else if (act.type === 'Swim') {
        activityType = 'swim';
      }
      
      return {
        id: act.id,
        name: act.name,
        type: activityType,
        date: act.start_date.split('T')[0],
        duration: Math.round(act.moving_time / 60),
        distance: act.distance / 1000,
        avgHR: act.average_heartrate,
        maxHR: act.max_heartrate,
        elevation: act.total_elevation_gain,
        tss: act.suffer_score,
        source: 'Strava'
      };
    });

    // Recharger la DB pour avoir les dernières données
    db = loadDB();
    const existingIds = new Set(db.activities.map(a => a.id));
    const newActivities = activities.filter(a => !existingIds.has(a.id));
    
    db.activities = [...db.activities, ...newActivities].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    saveDB(db);

    console.log(`✓ ${newActivities.length} nouvelles activités ajoutées`);
    console.log(`✓ Total: ${db.activities.length} activités`);

    res.json({ 
      success: true, 
      newActivities: newActivities.length,
      totalActivities: db.activities.length 
    });
  } catch (error) {
    console.error('❌ Erreur sync Strava:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
    
    // Si erreur 401, le token est invalide
    if (error.response?.status === 401) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token Strava invalide. Veuillez reconnecter votre compte.',
        needsAuth: true
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.response?.data 
    });
  }
});

// ===== GARMIN API =====

let garminClient = null;

function getGarminClient() {
  if (!garminClient) {
    garminClient = new GarminConnect({
      username: config.garmin.email,
      password: config.garmin.password
    });
  }
  return garminClient;
}

app.get('/api/garmin/status', async (req, res) => {
  try {
    const client = getGarminClient();
    await client.login();
    res.json({ connected: true });
  } catch (error) {
    res.json({ connected: false, error: error.message });
  }
});

// Fonction helper pour extraire les données de sommeil
function extractSleepData(sleepData, dateStr) {
  if (!sleepData || !sleepData.dailySleepDTO) {
    return null;
  }

  const sleep = sleepData.dailySleepDTO;
  
  // Vérifier que sleepTimeSeconds existe et est un nombre
  if (typeof sleep.sleepTimeSeconds !== 'number') {
    console.log(`⚠️ Pas de sleepTimeSeconds valide pour ${dateStr}`);
    return null;
  }

  return {
    date: dateStr,
    duration: Math.round(sleep.sleepTimeSeconds / 60), // en minutes
    quality: sleep.sleepScores?.overall?.value || 0,
    deepSleep: Math.round((sleep.deepSleepSeconds || 0) / 60),
    lightSleep: Math.round((sleep.lightSleepSeconds || 0) / 60),
    remSleep: Math.round((sleep.remSleepSeconds || 0) / 60),
    awake: Math.round((sleep.awakeSleepSeconds || 0) / 60),
    hrv: sleepData.avgOvernightHrv || null,
    restingHR: sleepData.restingHeartRate || null
  };
}

app.post('/api/sync/garmin', async (req, res) => {
  console.log('📥 Début synchronisation Garmin...');
  
  try {
    const client = getGarminClient();
    await client.login();
    console.log('✓ Connecté à Garmin');
    
    // Récupérer les 30 derniers jours de sommeil
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const sleepDataArray = [];
    let successCount = 0;
    let failCount = 0;
    
    // Parcourir chaque jour
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      
      try {
        // IMPORTANT: Passer un objet Date, pas une string !
        const dateObj = new Date(dateStr + 'T12:00:00Z');
        const sleepData = await client.getSleepData(dateObj);
        
        const extracted = extractSleepData(sleepData, dateStr);
        
        if (extracted) {
          sleepDataArray.push(extracted);
          successCount++;
          console.log(`✓ ${dateStr}: ${Math.round(extracted.duration/60)}h de sommeil`);
        } else {
          failCount++;
          console.log(`⚠️ ${dateStr}: Pas de données valides`);
        }
      } catch (err) {
        failCount++;
        console.log(`⚠️ ${dateStr}: ${err.message}`);
      }
    }
    
    console.log(`\n📊 Résumé: ${successCount} jours récupérés, ${failCount} échecs`);
    
    // Sauvegarder dans la base de données
    const db = loadDB();
    const existingDates = new Set(db.sleepData.map(s => s.date));
    const newSleep = sleepDataArray.filter(s => !existingDates.has(s.date));
    
    db.sleepData = [...db.sleepData, ...newSleep].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    saveDB(db);
    
    console.log(`✓ ${newSleep.length} nouvelles nuits ajoutées`);
    console.log(`✓ Total: ${db.sleepData.length} nuits`);
    
    res.json({ 
      success: true, 
      newNights: newSleep.length,
      totalNights: db.sleepData.length,
      daysScanned: successCount + failCount,
      daysFound: successCount
    });
    
  } catch (error) {
    console.error('❌ Erreur sync Garmin:', error.message);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ===== ENDPOINTS API =====

app.get('/api/activities', (req, res) => {
  const db = loadDB();
  console.log(`📤 Envoi de ${db.activities.length} activités`);
  res.json(db.activities || []);
});

app.get('/api/sleep', (req, res) => {
  const db = loadDB();
  console.log(`📤 Envoi de ${db.sleepData.length} nuits`);
  res.json(db.sleepData || []);
});

app.get('/api/status', (req, res) => {
  const db = loadDB();
  
  const stravaConfigured = !!db.tokens.strava || !!config.strava.refreshToken;
  
  console.log('📊 Status check:', {
    strava: stravaConfigured,
    garmin: !!(config.garmin.email && config.garmin.password),
    activitiesCount: db.activities.length,
    sleepCount: db.sleepData.length
  });
  
  res.json({
    strava: stravaConfigured,
    garmin: !!config.garmin.email && !!config.garmin.password,
    activitiesCount: db.activities.length,
    sleepCount: db.sleepData.length
  });
});

app.post('/api/disconnect/strava', (req, res) => {
  const db = loadDB();
  delete db.tokens.strava;
  saveDB(db);
  res.json({ success: true });
});

app.post('/api/disconnect/garmin', (req, res) => {
  const db = loadDB();
  delete db.tokens.garmin;
  saveDB(db);
  res.json({ success: true });
});

// ===== CRON JOBS =====
const cron = require('node-cron');

// Synchroniser Strava toutes les heures
cron.schedule('0 * * * *', async () => {
  console.log('🔄 Synchronisation automatique Strava...');
  try {
    const token = await getValidStravaToken();
    const after = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    const response = await axios.get(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    const activities = response.data.map(act => {
      let activityType = 'run';
      if (act.type === 'Ride' || act.type === 'VirtualRide' || act.type === 'EBikeRide') {
        activityType = 'bike';
      } else if (act.type === 'Run' || act.type === 'VirtualRun') {
        activityType = 'run';
      } else if (act.type === 'Swim') {
        activityType = 'swim';
      }
      
      return {
        id: act.id,
        name: act.name,
        type: activityType,
        date: act.start_date.split('T')[0],
        duration: Math.round(act.moving_time / 60),
        distance: act.distance / 1000,
        avgHR: act.average_heartrate,
        maxHR: act.max_heartrate,
        elevation: act.total_elevation_gain,
        tss: act.suffer_score,
        source: 'Strava'
      };
    });

    const db = loadDB();
    const existingIds = new Set(db.activities.map(a => a.id));
    const newActivities = activities.filter(a => !existingIds.has(a.id));
    
    if (newActivities.length > 0) {
      db.activities = [...db.activities, ...newActivities].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
      );
      saveDB(db);
      console.log(`✅ Strava synchronisé: ${newActivities.length} nouvelles activités`);
    } else {
      console.log('✅ Strava synchronisé: aucune nouvelle activité');
    }
  } catch (error) {
    console.error('❌ Erreur sync auto Strava:', error.message);
  }
});

// Synchroniser Garmin tous les jours à 7h
cron.schedule('0 7 * * *', async () => {
  console.log('🔄 Synchronisation automatique Garmin...');
  try {
    const client = getGarminClient();
    await client.login();
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    // IMPORTANT: Passer un objet Date, pas une string !
    const dateObj = new Date(dateStr + 'T12:00:00Z');
    const sleepData = await client.getSleepData(dateObj);
    const extracted = extractSleepData(sleepData, dateStr);
    
    if (extracted) {
      const db = loadDB();
      
      // Ajouter si pas déjà présent
      if (!db.sleepData.find(s => s.date === dateStr)) {
        db.sleepData.push(extracted);
        db.sleepData.sort((a, b) => new Date(b.date) - new Date(a.date));
        saveDB(db);
        console.log(`✅ Garmin synchronisé: ${Math.round(extracted.duration/60)}h de sommeil`);
      } else {
        console.log('✅ Garmin synchronisé: données déjà présentes');
      }
    } else {
      console.log('⚠️ Garmin: pas de données de sommeil pour hier');
    }
  } catch (error) {
    console.error('❌ Erreur sync auto Garmin:', error.message);
  }
});

// ===== DÉMARRAGE DU SERVEUR =====
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 Strava auth: http://localhost:${PORT}/auth/strava`);
});