import React, { useState, useEffect } from 'react';
import { Activity, Calendar, TrendingUp, Cloud, Moon, Heart, Zap, AlertCircle, CheckCircle } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
  const [activities, setActivities] = useState([]);
  const [sleepData, setSleepData] = useState([]);
  const [status, setStatus] = useState({ strava: false, garmin: false });
  const [syncing, setSyncing] = useState({ strava: false, garmin: false });
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState({ atl: 0, ctl: 0, tsb: 0, weeklyLoad: 0 });

  useEffect(() => {
    checkStatus();
    loadActivities();
    loadSleep();
  }, []);

  useEffect(() => {
    if (activities.length > 0) {
      calculateMetrics();
    }
  }, [activities, sleepData]);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/status');
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Erreur status:', error);
    }
  };

  const loadActivities = async () => {
    try {
      const response = await fetch('/api/activities');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setActivities(Array.isArray(data) ? data : []);
      setError(null);
    } catch (error) {
      console.error('Erreur chargement activités:', error);
      setActivities([]);
      setError('Impossible de charger les activités');
    }
  };

  const loadSleep = async () => {
    try {
      const response = await fetch('/api/sleep');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setSleepData(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erreur chargement sommeil:', error);
      setSleepData([]);
    }
  };

  const syncStrava = async () => {
    setSyncing(prev => ({ ...prev, strava: true }));
    setError(null);
    try {
      const response = await fetch('/api/sync/strava', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.success) {
        alert(`✅ ${data.newActivities} nouvelles activités Strava !`);
        await loadActivities();
        await checkStatus();
      } else {
        setError(data.error || 'Erreur de synchronisation Strava');
        if (data.needsAuth && confirm('Token Strava invalide. Reconnecter ?')) {
          window.location.href = '/auth/strava';
        }
      }
    } catch (error) {
      setError('Erreur: ' + error.message);
    } finally {
      setSyncing(prev => ({ ...prev, strava: false }));
    }
  };

  const syncGarmin = async () => {
    setSyncing(prev => ({ ...prev, garmin: true }));
    setError(null);
    try {
      const response = await fetch('/api/sync/garmin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.success) {
        alert(`✅ ${data.newNights} nouvelles nuits de sommeil !`);
        await loadSleep();
        await checkStatus();
      } else {
        setError(data.error || 'Erreur de synchronisation Garmin');
      }
    } catch (error) {
      setError('Erreur: ' + error.message);
    } finally {
      setSyncing(prev => ({ ...prev, garmin: false }));
    }
  };

  const calculateMetrics = () => {
    const today = new Date();
    const last7Days = activities.filter(a => {
      const actDate = new Date(a.date);
      const diff = (today - actDate) / (1000 * 60 * 60 * 24);
      return diff <= 7;
    });
    
    const last42Days = activities.filter(a => {
      const actDate = new Date(a.date);
      const diff = (today - actDate) / (1000 * 60 * 60 * 24);
      return diff <= 42;
    });

    const weeklyTSS = last7Days.reduce((sum, a) => sum + (a.tss || estimateTSS(a)), 0);
    const atl = weeklyTSS / 7; // Acute Training Load (moyenne 7 jours)
    const ctl = last42Days.reduce((sum, a) => sum + (a.tss || estimateTSS(a)), 0) / 42; // Chronic Training Load (moyenne 42 jours)
    const tsb = ctl - atl; // Training Stress Balance

    setMetrics({ atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(tsb), weeklyLoad: Math.round(weeklyTSS) });
  };

  const estimateTSS = (activity) => {
    // Estimation simple du TSS basée sur durée et type
    const base = {
      run: 1.2,
      bike: 0.8,
      swim: 1.0
    };
    return (activity.duration || 0) * (base[activity.type] || 1);
  };

  const getChartData = () => {
    const last30Days = [];
    for (let i = 29; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayActivities = activities.filter(a => a.date === dateStr);
      const dayTSS = dayActivities.reduce((sum, a) => sum + (a.tss || estimateTSS(a)), 0);
      
      const sleep = sleepData.find(s => s.date === dateStr);
      
      last30Days.push({
        date: dateStr.slice(5),
        tss: Math.round(dayTSS),
        sleep: sleep ? Math.round(sleep.duration / 60) : 0,
        quality: sleep ? sleep.quality : 0
      });
    }
    return last30Days;
  };

  const getRecommendations = () => {
    const recs = [];
    const avgSleep = sleepData.slice(0, 7).reduce((sum, s) => sum + s.duration, 0) / (sleepData.slice(0, 7).length || 1);
    
    if (metrics.tsb < -10) {
      recs.push({ type: 'warning', text: 'TSB négatif : Risque de surmenage. Prévoir une semaine de récupération.' });
    } else if (metrics.tsb > 15) {
      recs.push({ type: 'info', text: 'TSB élevé : Forme optimale pour une séance intensive ou une compétition.' });
    }
    
    if (avgSleep < 420) { // < 7h
      recs.push({ type: 'warning', text: `Sommeil insuffisant (${Math.round(avgSleep/60)}h/nuit). Visez 7-9h pour optimiser la récupération.` });
    } else {
      recs.push({ type: 'success', text: `Bon sommeil (${Math.round(avgSleep/60)}h/nuit). Continuez ainsi !` });
    }
    
    if (metrics.weeklyLoad > 600) {
      recs.push({ type: 'warning', text: 'Charge hebdomadaire élevée. Surveillez les signes de fatigue.' });
    }
    
    const recentHR = activities.slice(0, 5).filter(a => a.avgHR).map(a => a.avgHR);
    if (recentHR.length >= 3) {
      const avgHR = recentHR.reduce((a, b) => a + b) / recentHR.length;
      if (avgHR > 160) {
        recs.push({ type: 'info', text: 'FC moyenne élevée. Incorporez plus de séances en endurance.' });
      }
    }
    
    return recs.length > 0 ? recs : [{ type: 'success', text: 'Tout va bien ! Continuez votre entraînement.' }];
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${mins}min`;
  };

  const getActivityIcon = (type) => {
    switch(type) {
      case 'run': return '🏃';
      case 'bike': return '🚴';
      case 'swim': return '🏊';
      default: return '💪';
    }
  };

  const getTSBColor = (tsb) => {
    if (tsb < -10) return 'text-red-600 bg-red-100';
    if (tsb > 15) return 'text-green-600 bg-green-100';
    return 'text-yellow-600 bg-yellow-100';
  };

  const chartData = getChartData();
  const recommendations = getRecommendations();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">🏊 Dashboard Triathlon</h1>
          <p className="text-gray-600">Analyse de charge et récupération</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Sync Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <button
            onClick={syncStrava}
            disabled={syncing.strava}
            className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            <Activity size={20} />
            {syncing.strava ? 'Sync...' : `Sync Strava (${status.activitiesCount || 0})`}
          </button>
          <button
            onClick={syncGarmin}
            disabled={syncing.garmin}
            className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition"
          >
            <Cloud size={20} />
            {syncing.garmin ? 'Sync...' : `Sync Garmin (${status.sleepCount || 0})`}
          </button>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="text-yellow-500" size={20} />
              <h3 className="font-semibold text-gray-700">ATL (7j)</h3>
            </div>
            <p className="text-3xl font-bold text-gray-800">{metrics.atl}</p>
            <p className="text-xs text-gray-500">Charge aiguë</p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="text-blue-500" size={20} />
              <h3 className="font-semibold text-gray-700">CTL (42j)</h3>
            </div>
            <p className="text-3xl font-bold text-gray-800">{metrics.ctl}</p>
            <p className="text-xs text-gray-500">Charge chronique</p>
          </div>

          <div className={`bg-white rounded-lg shadow-lg p-4 ${getTSBColor(metrics.tsb)}`}>
            <div className="flex items-center gap-2 mb-2">
              <Heart className="text-current" size={20} />
              <h3 className="font-semibold">TSB</h3>
            </div>
            <p className="text-3xl font-bold">{metrics.tsb}</p>
            <p className="text-xs opacity-75">Balance</p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="text-purple-500" size={20} />
              <h3 className="font-semibold text-gray-700">Semaine</h3>
            </div>
            <p className="text-3xl font-bold text-gray-800">{metrics.weeklyLoad}</p>
            <p className="text-xs text-gray-500">TSS total</p>
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertCircle className="text-indigo-600" size={24} />
            Recommandations
          </h2>
          <div className="space-y-3">
            {recommendations.map((rec, idx) => (
              <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg ${
                rec.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                rec.type === 'success' ? 'bg-green-50 border border-green-200' :
                'bg-blue-50 border border-blue-200'
              }`}>
                {rec.type === 'warning' && <AlertCircle className="text-yellow-600 flex-shrink-0" size={20} />}
                {rec.type === 'success' && <CheckCircle className="text-green-600 flex-shrink-0" size={20} />}
                {rec.type === 'info' && <AlertCircle className="text-blue-600 flex-shrink-0" size={20} />}
                <p className="text-sm">{rec.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4">Charge d'entraînement (30j)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="tss" fill="#8b5cf6" name="TSS" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4">Sommeil (30j)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="sleep" stroke="#3b82f6" strokeWidth={2} name="Heures" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activities List */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">Dernières activités</h2>
          {activities.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Aucune activité. Synchronisez Strava.</p>
          ) : (
            <div className="space-y-2">
              {activities.slice(0, 10).map(act => (
                <div key={act.id} className="flex items-center justify-between p-3 border border-gray-200 rounded hover:bg-gray-50 transition">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getActivityIcon(act.type)}</span>
                    <div>
                      <p className="font-semibold text-sm">{act.name || act.type}</p>
                      <p className="text-xs text-gray-500">{act.date}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{act.distance?.toFixed(1)} km</p>
                    <p className="text-xs text-gray-500">{formatDuration(act.duration)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sleep Data */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Moon className="text-indigo-600" size={24} />
            Sommeil récent
          </h2>
          {sleepData.length === 0 ? (
            <p className="text-center text-gray-500 py-8">Aucune donnée. Synchronisez Garmin.</p>
          ) : (
            <div className="space-y-2">
              {sleepData.slice(0, 7).map(sleep => (
                <div key={sleep.date} className="flex items-center justify-between p-3 border border-gray-200 rounded hover:bg-gray-50 transition">
                  <div>
                    <p className="font-semibold text-sm">{sleep.date}</p>
                    <p className="text-xs text-gray-500">Qualité: {sleep.quality}/100</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{formatDuration(sleep.duration)}</p>
                    <p className="text-xs text-gray-500">Profond: {formatDuration(sleep.deepSleep)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}