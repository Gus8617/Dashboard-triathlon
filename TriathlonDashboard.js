import React, { useState, useEffect } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Activity, Moon, TrendingUp, Calendar, Plus, Upload, Heart } from 'lucide-react';

const TriathlonDashboard = () => {
  const [activities, setActivities] = useState([]);
  const [sleepData, setSleepData] = useState([]);
  const [metrics, setMetrics] = useState({ atl: 0, ctl: 0, tsb: 0 });
  const [view, setView] = useState('dashboard');
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaTokens, setStravaTokens] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [garminConnected, setGarminConnected] = useState(false);
  const [garminTokens, setGarminTokens] = useState(null);
  const [syncingSleep, setSyncingSleep] = useState(false);

  useEffect(() => {
    loadData();
    checkStravaConnection();
    checkGarminConnection();
  }, []);

  useEffect(() => {
    calculateMetrics();
  }, [activities]);

  const loadData = async () => {
    try {
      const storedActivities = await window.storage.get('triathlon_activities');
      const storedSleep = await window.storage.get('triathlon_sleep');
      
      if (storedActivities?.value) {
        setActivities(JSON.parse(storedActivities.value));
      }
      if (storedSleep?.value) {
        setSleepData(JSON.parse(storedSleep.value));
      }
    } catch (error) {
      console.log('Première utilisation - pas de données stockées');
    }
  };

  const checkStravaConnection = async () => {
    try {
      const tokens = await window.storage.get('strava_tokens');
      if (tokens?.value) {
        const parsed = JSON.parse(tokens.value);
        setStravaTokens(parsed);
        setStravaConnected(true);
      }
    } catch (error) {
      console.log('Pas de connexion Strava');
    }
  };

  const checkGarminConnection = async () => {
    try {
      const tokens = await window.storage.get('garmin_tokens');
      if (tokens?.value) {
        const parsed = JSON.parse(tokens.value);
        setGarminTokens(parsed);
        setGarminConnected(true);
      }
    } catch (error) {
      console.log('Pas de connexion Garmin');
    }
  };

  const saveStravaTokens = async (tokens) => {
    await window.storage.set('strava_tokens', JSON.stringify(tokens));
    setStravaTokens(tokens);
    setStravaConnected(true);
  };

  const saveGarminTokens = async (tokens) => {
    await window.storage.set('garmin_tokens', JSON.stringify(tokens));
    setGarminTokens(tokens);
    setGarminConnected(true);
  };

  const saveActivities = async (newActivities) => {
    setActivities(newActivities);
    await window.storage.set('triathlon_activities', JSON.stringify(newActivities));
  };

  const saveSleepData = async (newSleep) => {
    setSleepData(newSleep);
    await window.storage.set('triathlon_sleep', JSON.stringify(newSleep));
  };

  // Convertir une activité Strava en format interne
  const convertStravaActivity = (stravaAct) => {
    const typeMap = {
      'Ride': 'bike',
      'Run': 'run',
      'Swim': 'swim',
      'VirtualRide': 'bike',
      'VirtualRun': 'run'
    };

    // Calculer l'intensité basée sur les zones cardio et suffer_score
    const calculateIntensity = () => {
      if (!stravaAct.suffer_score) return 'moderate';
      const tss = stravaAct.suffer_score;
      const hours = stravaAct.duration_min / 60;
      const tssPerHour = tss / hours;
      
      if (tssPerHour > 80) return 'very_hard';
      if (tssPerHour > 60) return 'hard';
      if (tssPerHour > 40) return 'moderate';
      return 'easy';
    };

    return {
      id: stravaAct.id,
      type: typeMap[stravaAct.type] || 'run',
      duration: Math.round(stravaAct.duration_min),
      distance: stravaAct.distance_km,
      intensity: calculateIntensity(),
      date: stravaAct.start_date.split('T')[0],
      name: stravaAct.name,
      avgHR: stravaAct.average_heartrate,
      maxHR: stravaAct.max_heartrate,
      elevation: stravaAct.elevation_gain,
      tss: stravaAct.suffer_score || null,
      hrZones: stravaAct.hr_zones,
      source: 'Strava'
    };
  };

  // Importer un fichier JSON Strava
  const handleImportJSON = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        const converted = json.map(convertStravaActivity);
        
        // Fusionner avec activités existantes en évitant les doublons
        const existingIds = new Set(activities.map(a => a.id));
        const newActivities = converted.filter(a => !existingIds.has(a.id));
        
        const merged = [...activities, ...newActivities].sort((a, b) => 
          new Date(b.date) - new Date(a.date)
        );
        
        saveActivities(merged);
        setShowImport(false);
        alert(`✅ ${newActivities.length} activités importées avec succès !`);
      } catch (error) {
        alert('❌ Erreur lors de l\'import du fichier JSON');
        console.error(error);
      }
    };
    reader.readAsText(file);
  };

  // Calculer le TSS (utilise suffer_score de Strava si disponible)
  const calculateTSS = (activity) => {
    if (activity.tss) return Math.round(activity.tss);

    const { duration, intensity } = activity;
    const hours = duration / 60;
    
    const intensityFactors = {
      'easy': 0.5,
      'moderate': 0.7,
      'hard': 0.85,
      'very_hard': 1.0
    };
    
    const factor = intensityFactors[intensity] || 0.7;
    return Math.round(hours * 100 * factor * factor);
  };

  const calculateMetrics = () => {
    if (activities.length === 0) return;

    const sortedActivities = [...activities].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    let ctl = 0;
    let atl = 0;

    const last7Days = sortedActivities.slice(-7);
    const last42Days = sortedActivities.slice(-42);

    atl = last7Days.reduce((sum, act) => sum + calculateTSS(act), 0) / 7;
    ctl = last42Days.reduce((sum, act) => sum + calculateTSS(act), 0) / 42;
    
    const tsb = ctl - atl;

    setMetrics({ atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(tsb) });
  };

  const prepareLoadData = () => {
    if (activities.length === 0) return [];

    const sortedActivities = [...activities].sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );

    const dailyData = {};
    
    sortedActivities.forEach(act => {
      const date = act.date;
      if (!dailyData[date]) {
        dailyData[date] = { date, tss: 0 };
      }
      dailyData[date].tss += calculateTSS(act);
    });

    const dataArray = Object.values(dailyData).slice(-30);
    
    return dataArray.map((day, idx) => {
      const prevDays = dataArray.slice(Math.max(0, idx - 6), idx + 1);
      const prevWeeks = dataArray.slice(Math.max(0, idx - 41), idx + 1);
      
      const atl = prevDays.reduce((sum, d) => sum + d.tss, 0) / prevDays.length;
      const ctl = prevWeeks.reduce((sum, d) => sum + d.tss, 0) / prevWeeks.length;
      
      return {
        ...day,
        atl: Math.round(atl),
        ctl: Math.round(ctl),
        tsb: Math.round(ctl - atl)
      };
    });
  };

  const prepareVolumeData = () => {
    const last30Days = activities
      .filter(act => {
        const actDate = new Date(act.date);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return actDate >= thirtyDaysAgo;
      });

    const volumeByType = last30Days.reduce((acc, act) => {
      const type = act.type;
      if (!acc[type]) acc[type] = { duration: 0, distance: 0 };
      acc[type].duration += act.duration;
      acc[type].distance += act.distance || 0;
      return acc;
    }, {});

    return Object.entries(volumeByType).map(([type, data]) => ({
      discipline: type === 'swim' ? 'Natation' : type === 'bike' ? 'Vélo' : 'Course',
      heures: Math.round(data.duration / 60 * 10) / 10,
      distance: Math.round(data.distance * 10) / 10
    }));
  };

  // Préparer données sommeil pour graphique
  const prepareSleepData = () => {
    return sleepData
      .slice(-30)
      .map(s => ({
        date: s.date,
        heures: Math.round(s.duration / 60 * 10) / 10,
        qualite: s.quality,
        hrv: s.hrv,
        fcRepos: s.restingHR
      }));
  };

  const addActivity = (activity) => {
    const newActivity = {
      ...activity,
      id: Date.now(),
      date: activity.date || new Date().toISOString().split('T')[0],
      source: 'Manual'
    };
    saveActivities([...activities, newActivity]);
    setShowAddActivity(false);
  };

  // Connexion Strava
  const connectStrava = () => {
    const clientId = prompt('Entrez votre Strava Client ID:');
    if (!clientId) return;

    const redirectUri = window.location.origin + window.location.pathname;
    const scope = 'read,activity:read_all';
    
    const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
    
    window.location.href = authUrl;
  };

  // Gérer le retour OAuth
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code && !stravaConnected) {
      handleStravaCallback(code);
    }
  }, []);

  const handleStravaCallback = async (code) => {
    const clientId = prompt('Entrez votre Strava Client ID:');
    const clientSecret = prompt('Entrez votre Strava Client Secret:');
    
    if (!clientId || !clientSecret) return;

    try {
      const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          grant_type: 'authorization_code'
        })
      });

      const data = await response.json();
      
      if (data.access_token) {
        await saveStravaTokens({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: data.expires_at,
          clientId: clientId,
          clientSecret: clientSecret
        });
        
        // Nettoyer l'URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Synchroniser immédiatement
        await syncStravaActivities(data.access_token);
      }
    } catch (error) {
      alert('Erreur lors de la connexion à Strava: ' + error.message);
    }
  };

  // Rafraîchir le token si expiré
  const refreshStravaToken = async () => {
    if (!stravaTokens) return null;

    const now = Date.now() / 1000;
    if (stravaTokens.expiresAt > now) {
      return stravaTokens.accessToken;
    }

    try {
      const response = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: stravaTokens.clientId,
          client_secret: stravaTokens.clientSecret,
          refresh_token: stravaTokens.refreshToken,
          grant_type: 'refresh_token'
        })
      });

      const data = await response.json();
      
      if (data.access_token) {
        await saveStravaTokens({
          ...stravaTokens,
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: data.expires_at
        });
        return data.access_token;
      }
    } catch (error) {
      console.error('Erreur refresh token:', error);
      return null;
    }
  };

  // Synchroniser les activités Strava
  const syncStravaActivities = async (accessToken = null) => {
    setSyncing(true);
    
    try {
      const token = accessToken || await refreshStravaToken();
      if (!token) {
        alert('Erreur: Token Strava invalide. Reconnectez-vous.');
        return;
      }

      // Récupérer les activités des 90 derniers jours
      const after = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
      
      const response = await fetch(
        `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=200`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const stravaActivities = await response.json();
      
      if (stravaActivities.error) {
        throw new Error(stravaActivities.message);
      }

      // Convertir au format interne
      const converted = stravaActivities.map(act => ({
        id: act.id,
        type: act.type === 'Ride' || act.type === 'VirtualRide' ? 'bike' : 
              act.type === 'Run' || act.type === 'VirtualRun' ? 'run' : 'swim',
        duration: Math.round(act.moving_time / 60),
        distance: act.distance / 1000,
        intensity: calculateIntensityFromTSS(act.suffer_score, act.moving_time / 3600),
        date: act.start_date.split('T')[0],
        name: act.name,
        avgHR: act.average_heartrate,
        maxHR: act.max_heartrate,
        elevation: act.total_elevation_gain,
        tss: act.suffer_score,
        source: 'Strava'
      }));

      // Fusionner avec activités existantes
      const existingIds = new Set(activities.map(a => a.id));
      const newActivities = converted.filter(a => !existingIds.has(a.id));
      
      const merged = [...activities, ...newActivities].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
      );
      
      await saveActivities(merged);
      alert(`✅ ${newActivities.length} nouvelles activités synchronisées !`);
    } catch (error) {
      alert('❌ Erreur lors de la synchronisation: ' + error.message);
      console.error(error);
    } finally {
      setSyncing(false);
    }
  };

  const calculateIntensityFromTSS = (tss, hours) => {
    if (!tss || !hours) return 'moderate';
    const tssPerHour = tss / hours;
    if (tssPerHour > 80) return 'very_hard';
    if (tssPerHour > 60) return 'hard';
    if (tssPerHour > 40) return 'moderate';
    return 'easy';
  };

  const disconnectStrava = async () => {
    if (confirm('Voulez-vous vraiment déconnecter Strava ?')) {
      await window.storage.delete('strava_tokens');
      setStravaConnected(false);
      setStravaTokens(null);
    }
  };

  // ===== GARMIN INTEGRATION =====
  
  const connectGarmin = () => {
    const consumerKey = prompt('Entrez votre Garmin Consumer Key:');
    if (!consumerKey) return;

    alert('⚠️ Garmin utilise OAuth 1.0a qui nécessite un backend.\n\nPour le déploiement sur Raspberry Pi, nous utiliserons une approche avec serveur local.');
    
    // Pour le prototype, on simule la connexion
    saveGarminTokens({
      consumerKey: consumerKey,
      consumerSecret: prompt('Entrez votre Garmin Consumer Secret:'),
      accessToken: 'will-be-generated-by-backend',
      accessTokenSecret: 'will-be-generated-by-backend'
    });
  };

  const syncGarminSleep = async () => {
    setSyncingSleep(true);
    
    try {
      // Note: Garmin Health API nécessite OAuth 1.0a avec backend
      // Simulation pour le prototype - sera remplacé par vraie API sur Raspberry
      
      alert('🔧 La synchronisation Garmin nécessite un backend.\n\nCette fonctionnalité sera disponible dans la version Raspberry Pi avec un serveur Node.js local.');
      
      // Exemple de données de sommeil qu'on récupérera
      const mockSleepData = [
        {
          date: '2025-12-27',
          duration: 450, // minutes
          quality: 85, // 0-100
          deepSleep: 120,
          lightSleep: 280,
          remSleep: 50,
          awake: 30,
          hrv: 65,
          restingHR: 48
        }
      ];
      
      // Fusionner avec données existantes
      const existingDates = new Set(sleepData.map(s => s.date));
      const newSleep = mockSleepData.filter(s => !existingDates.has(s.date));
      
      const merged = [...sleepData, ...newSleep].sort((a, b) => 
        new Date(b.date) - new Date(a.date)
      );
      
      await saveSleepData(merged);
      
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
    } finally {
      setSyncingSleep(false);
    }
  };

  const disconnectGarmin = async () => {
    if (confirm('Voulez-vous vraiment déconnecter Garmin ?')) {
      await window.storage.delete('garmin_tokens');
      setGarminConnected(false);
      setGarminTokens(null);
    }
  };

  const ImportModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-96">
        <h3 className="text-xl font-bold mb-4">Importer depuis Strava</h3>
        
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <p className="text-sm text-blue-800 mb-2">
              <strong>Comment obtenir vos données Strava :</strong>
            </p>
            <ol className="text-sm text-blue-700 space-y-1 ml-4 list-decimal">
              <li>Allez sur strava.com → Paramètres</li>
              <li>Cliquez sur "Mes données"</li>
              <li>Demandez un export de vos données</li>
              <li>Téléchargez le fichier JSON</li>
            </ol>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <Upload className="mx-auto text-gray-400 mb-2" size={32} />
            <label className="cursor-pointer">
              <span className="text-blue-600 hover:text-blue-700 font-medium">
                Cliquer pour sélectionner
              </span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
            </label>
            <p className="text-xs text-gray-500 mt-1">Fichier JSON uniquement</p>
          </div>

          <button
            onClick={() => setShowImport(false)}
            className="w-full bg-gray-200 py-2 rounded hover:bg-gray-300"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );

  const ActivityForm = () => {
    const [formData, setFormData] = useState({
      type: 'run',
      duration: 60,
      intensity: 'moderate',
      date: new Date().toISOString().split('T')[0]
    });

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-96">
          <h3 className="text-xl font-bold mb-4">Ajouter une activité</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Type</label>
              <select 
                className="w-full p-2 border rounded"
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
              >
                <option value="swim">Natation</option>
                <option value="bike">Vélo</option>
                <option value="run">Course</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Durée (min)</label>
              <input 
                type="number"
                className="w-full p-2 border rounded"
                value={formData.duration}
                onChange={(e) => setFormData({...formData, duration: parseInt(e.target.value)})}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Intensité</label>
              <select 
                className="w-full p-2 border rounded"
                value={formData.intensity}
                onChange={(e) => setFormData({...formData, intensity: e.target.value})}
              >
                <option value="easy">Facile</option>
                <option value="moderate">Modéré</option>
                <option value="hard">Difficile</option>
                <option value="very_hard">Très difficile</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input 
                type="date"
                className="w-full p-2 border rounded"
                value={formData.date}
                onChange={(e) => setFormData({...formData, date: e.target.value})}
              />
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => addActivity(formData)}
                className="flex-1 bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
              >
                Ajouter
              </button>
              <button
                onClick={() => setShowAddActivity(false)}
                className="flex-1 bg-gray-200 py-2 rounded hover:bg-gray-300"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getActivityIcon = (type) => {
    const icons = {
      'swim': '🏊',
      'bike': '🚴',
      'run': '🏃'
    };
    return icons[type] || '🏃';
  };

  const getActivityLabel = (type) => {
    const labels = {
      'swim': 'Natation',
      'bike': 'Vélo',
      'run': 'Course'
    };
    return labels[type] || 'Course';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6">
        <h1 className="text-3xl font-bold">Dashboard Triathlon</h1>
        <p className="text-blue-100 mt-1">Suivi de charge et performance</p>
      </div>

      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-6">
            <button
              onClick={() => setView('dashboard')}
              className={`py-4 px-2 border-b-2 ${view === 'dashboard' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'}`}
            >
              Tableau de bord
            </button>
            <button
              onClick={() => setView('activities')}
              className={`py-4 px-2 border-b-2 ${view === 'activities' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'}`}
            >
              Activités ({activities.length})
            </button>
            <button
              onClick={() => setView('strava')}
              className={`py-4 px-2 border-b-2 ${view === 'strava' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'}`}
            >
              Strava {stravaConnected && '✓'}
            </button>
            <button
              onClick={() => setView('garmin')}
              className={`py-4 px-2 border-b-2 ${view === 'garmin' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600'}`}
            >
              Garmin {garminConnected && '✓'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {view === 'dashboard' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">ATL (7 jours)</p>
                    <p className="text-3xl font-bold text-orange-600">{metrics.atl}</p>
                    <p className="text-xs text-gray-400 mt-1">Charge aiguë</p>
                  </div>
                  <TrendingUp className="text-orange-600" size={32} />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">CTL (42 jours)</p>
                    <p className="text-3xl font-bold text-blue-600">{metrics.ctl}</p>
                    <p className="text-xs text-gray-400 mt-1">Forme chronique</p>
                  </div>
                  <Activity className="text-blue-600" size={32} />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm">TSB</p>
                    <p className={`text-3xl font-bold ${metrics.tsb > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {metrics.tsb}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {metrics.tsb > 5 ? 'Frais' : metrics.tsb < -10 ? 'Fatigué' : 'Optimal'}
                    </p>
                  </div>
                  <Moon className={metrics.tsb > 0 ? 'text-green-600' : 'text-red-600'} size={32} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-bold mb-4">Évolution de la charge (30 derniers jours)</h2>
              {activities.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={prepareLoadData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{fontSize: 12}} />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="ctl" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="CTL (Forme)" />
                    <Area type="monotone" dataKey="atl" stackId="2" stroke="#f97316" fill="#f97316" fillOpacity={0.6} name="ATL (Fatigue)" />
                    <Line type="monotone" dataKey="tsb" stroke="#10b981" strokeWidth={2} name="TSB (Fraîcheur)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  Aucune donnée. Importez vos activités Strava ou ajoutez-les manuellement.
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold mb-4">Volume par discipline (30 jours)</h2>
              {activities.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={prepareVolumeData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="discipline" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="heures" fill="#3b82f6" name="Heures" />
                    <Bar yAxisId="right" dataKey="distance" fill="#10b981" name="Distance (km)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  Aucune donnée disponible
                </div>
              )}
            </div>
          </>
        )}

        {view === 'activities' && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Activités récentes</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowImport(true)}
                  className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700"
                >
                  <Upload size={20} />
                  Importer Strava
                </button>
                <button
                  onClick={() => setShowAddActivity(true)}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                >
                  <Plus size={20} />
                  Ajouter
                </button>
              </div>
            </div>

            {activities.length > 0 ? (
              <div className="space-y-3">
                {[...activities].slice(0, 50).map(act => (
                  <div key={act.id} className="border rounded p-4 hover:bg-gray-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">{getActivityIcon(act.type)}</span>
                          <span className="font-semibold">{act.name || getActivityLabel(act.type)}</span>
                          {act.source === 'Strava' && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">Strava</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          <span className="font-medium">{act.date}</span>
                          {' • '}
                          {act.duration} min
                          {act.distance && ` • ${act.distance.toFixed(1)} km`}
                          {act.avgHR && (
                            <>
                              {' • '}
                              <Heart className="inline" size={14} />
                              {' '}{Math.round(act.avgHR)} bpm
                            </>
                          )}
                          {' • '}
                          TSS: {calculateTSS(act)}
                        </div>
                        {act.elevation && (
                          <div className="text-xs text-gray-500 mt-1">
                            D+ {Math.round(act.elevation)}m
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Upload className="mx-auto mb-4 text-gray-300" size={48} />
                <p className="mb-2">Aucune activité enregistrée</p>
                <p className="text-sm">Importez vos données Strava ou ajoutez des activités manuellement</p>
              </div>
            )}
          </div>
        )}

        {view === 'strava' && (
          <div className="space-y-6">
            {!stravaConnected ? (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-orange-600 rounded-lg flex items-center justify-center text-white text-2xl font-bold">
                    S
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Connecter Strava</h2>
                    <p className="text-gray-600">Synchronisez automatiquement vos activités</p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800 font-semibold mb-2">
                    📋 Configuration requise :
                  </p>
                  <ol className="text-sm text-blue-700 space-y-2 ml-4 list-decimal">
                    <li>
                      Allez sur{' '}
                      <a 
                        href="https://www.strava.com/settings/api" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline font-medium"
                      >
                        strava.com/settings/api
                      </a>
                    </li>
                    <li>Créez une nouvelle application</li>
                    <li>
                      <strong>Authorization Callback Domain:</strong> Ajoutez le domaine de ce site
                    </li>
                    <li>Copiez votre <strong>Client ID</strong> et <strong>Client Secret</strong></li>
                  </ol>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-yellow-800">
                    ⚠️ <strong>Note importante:</strong> Vos tokens seront stockés localement dans votre navigateur. 
                    Ne partagez jamais votre Client Secret.
                  </p>
                </div>

                <button
                  onClick={connectStrava}
                  className="w-full bg-orange-600 text-white py-3 px-6 rounded-lg hover:bg-orange-700 font-semibold text-lg"
                >
                  Se connecter avec Strava
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-green-600 rounded-lg flex items-center justify-center text-white text-2xl">
                      ✓
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-green-600">Strava Connecté</h2>
                      <p className="text-gray-600">Synchronisation automatique activée</p>
                    </div>
                  </div>
                  <button
                    onClick={disconnectStrava}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Déconnecter
                  </button>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={() => syncStravaActivities()}
                    disabled={syncing}
                    className="w-full bg-orange-600 text-white py-3 px-6 rounded-lg hover:bg-orange-700 font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {syncing ? '⏳ Synchronisation en cours...' : '🔄 Synchroniser maintenant'}
                  </button>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">Informations</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Activités synchronisées: {activities.filter(a => a.source === 'Strava').length}</li>
                      <li>• Période: 90 derniers jours</li>
                      <li>• Fréquence: Manuelle (cliquez sur "Synchroniser")</li>
                    </ul>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      💡 <strong>Astuce:</strong> Synchronisez régulièrement pour garder vos données à jour. 
                      La synchronisation récupère automatiquement les nouvelles activités sans créer de doublons.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'garmin' && (
          <div className="space-y-6">
            {!garminConnected ? (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-blue-600 rounded-lg flex items-center justify-center text-white text-2xl font-bold">
                    G
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">Connecter Garmin</h2>
                    <p className="text-gray-600">Synchronisez vos données de sommeil</p>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-blue-800 font-semibold mb-2">
                    📋 Configuration requise :
                  </p>
                  <ol className="text-sm text-blue-700 space-y-2 ml-4 list-decimal">
                    <li>
                      Inscrivez-vous sur{' '}
                      <a 
                        href="https://developer.garmin.com" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="underline font-medium"
                      >
                        Garmin Developer Program
                      </a>
                    </li>
                    <li>Créez une application dans le Health API</li>
                    <li>Copiez votre <strong>Consumer Key</strong> et <strong>Consumer Secret</strong></li>
                    <li>
                      <strong>Note:</strong> Garmin utilise OAuth 1.0a qui nécessite un serveur backend
                    </li>
                  </ol>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-yellow-800">
                    ⚠️ <strong>Important:</strong> L'API Garmin Health nécessite un backend pour l'authentification OAuth 1.0a. 
                    Cette fonctionnalité sera complètement opérationnelle dans la version Raspberry Pi avec serveur Node.js.
                  </p>
                </div>

                <button
                  onClick={connectGarmin}
                  className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 font-semibold text-lg"
                >
                  Configurer Garmin (Prototype)
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-green-600 rounded-lg flex items-center justify-center text-white text-2xl">
                      ✓
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-green-600">Garmin Configuré</h2>
                      <p className="text-gray-600">Prêt pour la synchronisation</p>
                    </div>
                  </div>
                  <button
                    onClick={disconnectGarmin}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                  >
                    Déconnecter
                  </button>
                </div>

                <div className="space-y-4">
                  <button
                    onClick={syncGarminSleep}
                    disabled={syncingSleep}
                    className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {syncingSleep ? '⏳ Synchronisation en cours...' : '🔄 Synchroniser le sommeil'}
                  </button>

                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">Données de sommeil</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Nuits enregistrées: {sleepData.length}</li>
                      <li>• Métriques: Durée, qualité, phases, HRV, FC repos</li>
                      <li>• Synchronisation: Manuelle via backend</li>
                    </ul>
                  </div>

                  {sleepData.length > 0 && (
                    <div className="bg-white border rounded-lg p-4">
                      <h3 className="font-semibold mb-3">Dernières nuits</h3>
                      <div className="space-y-2">
                        {sleepData.slice(0, 5).map(sleep => (
                          <div key={sleep.date} className="flex justify-between items-center text-sm border-b pb-2">
                            <span className="font-medium">{sleep.date}</span>
                            <div className="flex gap-4 text-gray-600">
                              <span>🛏️ {Math.round(sleep.duration / 60)}h{sleep.duration % 60}min</span>
                              <span>📊 {sleep.quality}%</span>
                              <span>❤️ {sleep.restingHR} bpm</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      💡 <strong>Version Raspberry Pi:</strong> La synchronisation automatique sera activée avec 
                      un serveur Node.js local qui gérera l'authentification OAuth 1.0a et récupérera vos données de sommeil quotidiennement.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showAddActivity && <ActivityForm />}
      {showImport && <ImportModal />}
    </div>
  );
};

export default TriathlonDashboard;