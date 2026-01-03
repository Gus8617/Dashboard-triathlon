import React, { useState, useEffect } from 'react';
import { Activity, Calendar, TrendingUp, Cloud, Moon, Heart, Zap, AlertCircle, CheckCircle, Battery, Target, Trophy, Bike, Waves, Timer } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';

export default function Dashboard() {
  const [activities, setActivities] = useState([]);
  const [sleepData, setSleepData] = useState([]);
  const [status, setStatus] = useState({ strava: false, garmin: false });
  const [syncing, setSyncing] = useState({ strava: false, garmin: false });
  const [error, setError] = useState(null);
  const [metrics, setMetrics] = useState({ atl: 0, ctl: 0, tsb: 0, weeklyLoad: 0 });
  const [trainingZones, setTrainingZones] = useState({ z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 });
  const [sportStats, setSportStats] = useState({ run: {}, bike: {}, swim: {} });
  const [trendData, setTrendData] = useState([]);
  const [recoveryScore, setRecoveryScore] = useState(0);

  useEffect(() => {
    checkStatus();
    loadActivities();
    loadSleep();
  }, []);

  useEffect(() => {
    if (activities.length > 0 || sleepData.length > 0) {
      // Calculer dans l'ordre : d'abord les métriques, puis le reste
      calculateMetrics();
      analyzeTrainingZones();
      analyzeBySport();
      calculateTrendData();
      
      // Calculer le score de récupération en dernier (après metrics)
      setTimeout(() => {
        calculateRecoveryScore();
      }, 100);
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
        await loadActivities();
        await checkStatus();
        
        // Forcer le recalcul après chargement
        setTimeout(() => {
          calculateMetrics();
          analyzeTrainingZones();
          analyzeBySport();
          calculateTrendData();
          calculateRecoveryScore();
        }, 200);
        
        alert(`✅ ${data.newActivities} nouvelles activités Strava !`);
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
        await loadSleep();
        await checkStatus();
        
        // Forcer le recalcul après chargement
        setTimeout(() => {
          calculateMetrics();
          calculateRecoveryScore();
        }, 200);
        
        alert(`✅ ${data.newNights} nouvelles nuits de sommeil !`);
      } else {
        setError(data.error || 'Erreur de synchronisation Garmin');
      }
    } catch (error) {
      setError('Erreur: ' + error.message);
    } finally {
      setSyncing(prev => ({ ...prev, garmin: false }));
    }
  };

  const calculateRecoveryScore = () => {
    const recentSleep = sleepData.slice(0, 1); // Dernière nuit uniquement (comme Garmin)
    const recentActivities = activities.slice(0, 7);
    
    if (recentSleep.length === 0) {
      setRecoveryScore(50);
      return;
    }

    const lastNight = recentSleep[0];
    
    // 1. Score sommeil (35%) - basé sur durée et qualité
    const sleepDuration = lastNight.duration;
    const sleepQuality = lastNight.quality || 50;
    const optimalSleep = 480; // 8h
    const durationScore = Math.min(100, (sleepDuration / optimalSleep) * 100);
    const sleepScore = (durationScore * 0.6 + sleepQuality * 0.4);
    
    // 2. Score HRV (35%) - comparé à la moyenne des 7 derniers jours
    const recentHRVs = sleepData.slice(0, 7).filter(s => s.hrv).map(s => s.hrv);
    let hrvScore = 50;
    if (recentHRVs.length >= 3) {
      const avgHRV = recentHRVs.reduce((a, b) => a + b) / recentHRVs.length;
      const lastHRV = lastNight.hrv || avgHRV;
      const hrvRatio = lastHRV / avgHRV;
      
      // HRV > moyenne = bon, HRV < moyenne = fatigue
      if (hrvRatio >= 1.1) hrvScore = 100;
      else if (hrvRatio >= 1.0) hrvScore = 85;
      else if (hrvRatio >= 0.95) hrvScore = 70;
      else if (hrvRatio >= 0.9) hrvScore = 55;
      else if (hrvRatio >= 0.85) hrvScore = 40;
      else hrvScore = 25;
    }
    
    // 3. Score FC repos (15%) - comparé à la moyenne
    const recentHRs = sleepData.slice(0, 7).filter(s => s.restingHR).map(s => s.restingHR);
    let hrScore = 50;
    if (recentHRs.length >= 3) {
      const avgHR = recentHRs.reduce((a, b) => a + b) / recentHRs.length;
      const lastHR = lastNight.restingHR || avgHR;
      const hrDiff = lastHR - avgHR;
      
      // FC repos plus basse = meilleur
      if (hrDiff <= -3) hrScore = 100;
      else if (hrDiff <= -1) hrScore = 85;
      else if (hrDiff <= 1) hrScore = 70;
      else if (hrDiff <= 3) hrScore = 50;
      else if (hrDiff <= 5) hrScore = 35;
      else hrScore = 20;
    }
    
    // 4. Score charge d'entraînement (15%) - basé sur TSB
    let loadScore = 50;
    if (metrics.tsb >= 10) loadScore = 100; // Très reposé
    else if (metrics.tsb >= 5) loadScore = 85;
    else if (metrics.tsb >= 0) loadScore = 70;
    else if (metrics.tsb >= -5) loadScore = 60;
    else if (metrics.tsb >= -10) loadScore = 40;
    else if (metrics.tsb >= -15) loadScore = 25;
    else loadScore = 10; // Surmenage
    
    const finalScore = Math.round(
      sleepScore * 0.35 + 
      hrvScore * 0.35 + 
      hrScore * 0.15 + 
      loadScore * 0.15
    );
    
    setRecoveryScore(Math.max(0, Math.min(100, finalScore)));
  };

  const calculateTrendData = () => {
    const trend = [];
    const today = new Date();
    
    for (let week = 11; week >= 0; week--) {
      const weekStart = new Date(today);
      weekStart.setDate(weekStart.getDate() - (week * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      const weekActivities = activities.filter(a => {
        const actDate = new Date(a.date);
        return actDate >= weekStart && actDate <= weekEnd;
      });
      
      const weekTSS = weekActivities.reduce((sum, a) => sum + (a.tss || estimateTSS(a)), 0);
      const atl = weekTSS / 7;
      
      // CTL = moyenne mobile sur 6 semaines précédentes
      const ctlActivities = activities.filter(a => {
        const actDate = new Date(a.date);
        const weeksAgo = Math.floor((today - actDate) / (1000 * 60 * 60 * 24 * 7));
        return weeksAgo >= week && weeksAgo < week + 6;
      });
      const ctl = ctlActivities.reduce((sum, a) => sum + (a.tss || estimateTSS(a)), 0) / 42;
      
      const tsb = ctl - atl;
      
      trend.push({
        week: `S-${week}`,
        atl: Math.round(atl),
        ctl: Math.round(ctl),
        tsb: Math.round(tsb),
        load: Math.round(weekTSS)
      });
    }
    
    setTrendData(trend);
  };

  const analyzeBySport = () => {
    const stats = {
      run: { count: 0, distance: 0, duration: 0, avgPace: [], elevation: 0 },
      bike: { count: 0, distance: 0, duration: 0, avgSpeed: [], elevation: 0 },
      swim: { count: 0, distance: 0, duration: 0, avgPace: [] }
    };
    
    const last30Days = activities.filter(a => {
      const actDate = new Date(a.date);
      const diff = (new Date() - actDate) / (1000 * 60 * 60 * 24);
      return diff <= 30;
    });
    
    last30Days.forEach(act => {
      const type = act.type;
      if (!stats[type]) return;
      
      stats[type].count++;
      stats[type].distance += act.distance || 0;
      stats[type].duration += act.duration || 0;
      stats[type].elevation += act.elevation || 0;
      
      if (act.distance && act.duration) {
        if (type === 'run') {
          const pace = act.duration / act.distance; // min/km
          stats[type].avgPace.push(pace);
        } else if (type === 'bike') {
          const speed = (act.distance / (act.duration / 60)); // km/h
          stats[type].avgSpeed.push(speed);
        } else if (type === 'swim') {
          const pace = act.duration / act.distance; // min/km
          stats[type].avgPace.push(pace);
        }
      }
    });
    
    // Calculer moyennes
    Object.keys(stats).forEach(sport => {
      if (stats[sport].avgPace?.length > 0) {
        stats[sport].avgPace = stats[sport].avgPace.reduce((a, b) => a + b) / stats[sport].avgPace.length;
      }
      if (stats[sport].avgSpeed?.length > 0) {
        stats[sport].avgSpeed = stats[sport].avgSpeed.reduce((a, b) => a + b) / stats[sport].avgSpeed.length;
      }
    });
    
    setSportStats(stats);
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
    const atl = weeklyTSS / 7;
    const ctl = last42Days.reduce((sum, a) => sum + (a.tss || estimateTSS(a)), 0) / 42;
    const tsb = ctl - atl;

    setMetrics({ atl: Math.round(atl), ctl: Math.round(ctl), tsb: Math.round(tsb), weeklyLoad: Math.round(weeklyTSS) });
  };

  const analyzeTrainingZones = () => {
    const last14Days = activities.filter(a => {
      const actDate = new Date(a.date);
      const diff = (new Date() - actDate) / (1000 * 60 * 60 * 24);
      return diff <= 14;
    });

    let zones = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
    
    last14Days.forEach(act => {
      if (!act.avgHR) return;
      const zone = getHRZone(act.avgHR);
      const duration = act.duration || 0;
      zones[zone] += duration;
    });

    setTrainingZones(zones);
  };

  const getHRZone = (avgHR) => {
    const fcmax = 190;
    const percent = (avgHR / fcmax) * 100;
    
    if (percent < 70) return 'z1';
    if (percent < 80) return 'z2';
    if (percent < 87) return 'z3';
    if (percent < 93) return 'z4';
    return 'z5';
  };

  const estimateTSS = (activity) => {
    const base = { run: 1.2, bike: 0.8, swim: 1.0 };
    return (activity.duration || 0) * (base[activity.type] || 1);
  };

  const getTrainingState = () => {
    const { tsb, atl, ctl } = metrics;
    const avgSleep = sleepData.slice(0, 3).reduce((sum, s) => sum + s.duration, 0) / (sleepData.slice(0, 3).length || 1);
    
    if (tsb < -15 || avgSleep < 390) {
      return {
        state: 'overreaching',
        label: '⚠️ SURMENAGE',
        color: 'bg-red-100 border-red-500 text-red-800',
        advice: 'REPOS OBLIGATOIRE. Risque de blessure élevé.',
        intensity: 'Arrêt total ou activités très légères uniquement'
      };
    } else if (tsb < -10) {
      return {
        state: 'fatigue',
        label: '🟡 FATIGUE',
        color: 'bg-orange-100 border-orange-500 text-orange-800',
        advice: 'Réduire la charge. Privilégier la récupération.',
        intensity: 'Séances faciles en Z1-Z2 uniquement, durée réduite'
      };
    } else if (tsb < -5) {
      return {
        state: 'productive',
        label: '💪 PRODUCTIF',
        color: 'bg-blue-100 border-blue-500 text-blue-800',
        advice: 'Zone idéale pour progresser. Continuez l\'entraînement.',
        intensity: 'Mix Z2 (70%), Z3-Z4 (30%). Éviter Z5 cette semaine'
      };
    } else if (tsb < 5) {
      return {
        state: 'fresh',
        label: '✅ FRAIS',
        color: 'bg-green-100 border-green-500 text-green-800',
        advice: 'Forme optimale. Bon moment pour séance clé ou compétition.',
        intensity: 'Séance intensive possible : intervalles Z4-Z5'
      };
    } else if (tsb < 15) {
      return {
        state: 'recovery',
        label: '🔋 RÉCUPÉRATION',
        color: 'bg-purple-100 border-purple-500 text-purple-800',
        advice: 'Période de récupération active. Maintenir un volume léger.',
        intensity: 'Z1-Z2 endurance facile, 30-60 min max'
      };
    } else {
      return {
        state: 'detraining',
        label: '😴 DÉSENTRAÎNEMENT',
        color: 'bg-gray-100 border-gray-500 text-gray-800',
        advice: 'Risque de perte de forme. Augmenter progressivement la charge.',
        intensity: 'Reprendre progressivement : Z2-Z3 en priorité'
      };
    }
  };

  const getZoneDistribution = () => {
    const total = Object.values(trainingZones).reduce((sum, v) => sum + v, 0);
    if (total === 0) return [];
    
    return [
      { name: 'Z1 Récup', value: Math.round((trainingZones.z1 / total) * 100), color: '#10b981', minutes: trainingZones.z1 },
      { name: 'Z2 Endurance', value: Math.round((trainingZones.z2 / total) * 100), color: '#3b82f6', minutes: trainingZones.z2 },
      { name: 'Z3 Tempo', value: Math.round((trainingZones.z3 / total) * 100), color: '#f59e0b', minutes: trainingZones.z3 },
      { name: 'Z4 Seuil', value: Math.round((trainingZones.z4 / total) * 100), color: '#ef4444', minutes: trainingZones.z4 },
      { name: 'Z5 VO2max', value: Math.round((trainingZones.z5 / total) * 100), color: '#7c3aed', minutes: trainingZones.z5 }
    ].filter(z => z.value > 0);
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
      
      const [year, month, day] = dateStr.split('-');
      const formattedDate = `${day}/${month}`;
      
      last30Days.push({
        date: formattedDate,
        tss: Math.round(dayTSS),
        sleep: sleep ? Math.round(sleep.duration / 60) : 0,
        quality: sleep ? sleep.quality : 0,
        hrv: sleep ? sleep.hrv : null,
        restingHR: sleep ? sleep.restingHR : null
      });
    }
    return last30Days;
  };

  const getRecommendations = () => {
    const recs = [];
    const state = getTrainingState();
    const avgSleep = sleepData.slice(0, 7).reduce((sum, s) => sum + s.duration, 0) / (sleepData.slice(0, 7).length || 1);
    const zoneData = getZoneDistribution();
    
    recs.push({ type: state.state === 'overreaching' || state.state === 'fatigue' ? 'warning' : 'info', text: state.advice });
    
    if (avgSleep < 420) {
      recs.push({ type: 'warning', text: `⚠️ Sommeil: ${Math.round(avgSleep/60)}h/nuit. Augmentez à 7-9h pour optimiser la récupération.` });
    } else if (avgSleep > 480) {
      recs.push({ type: 'success', text: `✅ Excellent sommeil: ${Math.round(avgSleep/60)}h/nuit. Récupération optimale !` });
    }
    
    const z2Percent = zoneData.find(z => z.name.includes('Z2'))?.value || 0;
    if (z2Percent < 50 && activities.length > 5) {
      recs.push({ type: 'warning', text: '⚠️ Trop d\'intensité. Augmentez le volume en Z2 (endurance) pour une base solide.' });
    } else if (z2Percent > 80) {
      recs.push({ type: 'info', text: '💡 Bon volume en endurance. Ajoutez 1-2 séances de qualité (Z4-Z5) par semaine.' });
    }
    
    const ratio = metrics.ctl > 0 ? metrics.atl / metrics.ctl : 0;
    if (ratio > 1.5) {
      recs.push({ type: 'warning', text: '⚠️ Augmentation brutale de charge. Risque de blessure accru.' });
    }
    
    // Analyse HRV
    const recentHRV = sleepData.slice(0, 7).filter(s => s.hrv).map(s => s.hrv);
    if (recentHRV.length >= 3) {
      const avgHRV = recentHRV.reduce((a, b) => a + b) / recentHRV.length;
      const lastHRV = recentHRV[0];
      if (lastHRV < avgHRV * 0.85) {
        recs.push({ type: 'warning', text: '💔 HRV en baisse significative. Signe de fatigue, privilégier le repos.' });
      }
    }
    
    return recs;
  };

  const getRecoveryColor = (score) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-blue-600 bg-blue-100';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const formatDate = (dateStr) => {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}`;
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${mins}min`;
  };

  const formatPace = (minPerKm, isSwim = false) => {
    if (isSwim) {
      // Pour la natation : convertir en min/100m
      const minPer100m = minPerKm / 10;
      const mins = Math.floor(minPer100m);
      const secs = Math.round((minPer100m - mins) * 60);
      return `${mins}'${secs.toString().padStart(2, '0')}"`;
    } else {
      // Pour la course : min/km
      const mins = Math.floor(minPerKm);
      const secs = Math.round((minPerKm - mins) * 60);
      return `${mins}'${secs.toString().padStart(2, '0')}"`;
    }
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
    if (tsb > 15) return 'text-gray-600 bg-gray-100';
    if (tsb > 5) return 'text-purple-600 bg-purple-100';
    return 'text-green-600 bg-green-100';
  };

  const chartData = getChartData();
  const recommendations = getRecommendations();
  const trainingState = getTrainingState();
  const zoneDistribution = getZoneDistribution();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">🏊 Dashboard Triathlon Pro</h1>
          <p className="text-gray-600">Coaching intelligent • Analyse complète • Progression optimale</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {/* Sync Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <button onClick={syncStrava} disabled={syncing.strava}
            className="flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition shadow-lg">
            <Activity size={20} />
            {syncing.strava ? 'Sync...' : `Sync Strava (${status.activitiesCount || 0})`}
          </button>
          <button onClick={syncGarmin} disabled={syncing.garmin}
            className="flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition shadow-lg">
            <Cloud size={20} />
            {syncing.garmin ? 'Sync...' : `Sync Garmin (${status.sleepCount || 0})`}
          </button>
          <button 
            onClick={() => {
              calculateMetrics();
              analyzeTrainingZones();
              analyzeBySport();
              calculateTrendData();
              calculateRecoveryScore();
              alert('✅ Métriques recalculées !');
            }}
            className="flex items-center justify-center gap-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold py-3 px-6 rounded-lg transition shadow-lg">
            <TrendingUp size={20} />
            Recalculer
          </button>
        </div>

        {/* Training State & Recovery */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className={`${trainingState.color} border-4 rounded-xl p-6 shadow-xl lg:col-span-2`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-3xl font-bold mb-2">{trainingState.label}</h2>
                <p className="text-lg font-semibold mb-2">{trainingState.advice}</p>
              </div>
              <Battery size={64} className="opacity-50" />
            </div>
            <div className="bg-white bg-opacity-50 rounded-lg p-4">
              <h3 className="font-bold mb-2">💡 Séance recommandée :</h3>
              <p className="text-lg">{trainingState.intensity}</p>
            </div>
          </div>

          <div className={`${getRecoveryColor(recoveryScore)} border-4 rounded-xl p-6 shadow-xl`}>
            <div className="flex items-center gap-3 mb-4">
              <Heart size={32} />
              <h3 className="text-xl font-bold">Score Récupération</h3>
            </div>
            <p className="text-5xl font-bold mb-2">{recoveryScore}</p>
            <p className="text-sm opacity-75 mb-3">
              {recoveryScore >= 80 ? '✅ Excellent' : 
               recoveryScore >= 60 ? '🟢 Bon' :
               recoveryScore >= 40 ? '🟡 Moyen' : '🔴 Faible'}
            </p>
            <div className="bg-white bg-opacity-40 rounded p-2 text-xs space-y-1">
              <p className="font-semibold mb-1">Calcul :</p>
              <p>• 35% Sommeil (durée + qualité)</p>
              <p>• 35% HRV (vs moyenne 7j)</p>
              <p>• 15% FC repos (vs moyenne)</p>
              <p>• 15% Charge (TSB)</p>
            </div>
            <div className="mt-3 pt-3 border-t border-white border-opacity-30 text-xs space-y-1">
              <p>Hier: {sleepData[0] ? formatDuration(sleepData[0].duration) : 'N/A'}</p>
              <p>HRV: {sleepData[0]?.hrv || 'N/A'} ms</p>
              <p>FC repos: {sleepData[0]?.restingHR || 'N/A'} bpm</p>
              <p>TSB: {metrics.tsb}</p>
            </div>
          </div>
        </div>

        {/* Metrics Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-4 hover:shadow-xl transition">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="text-yellow-500" size={20} />
              <h3 className="font-semibold text-gray-700 text-sm">ATL (7j)</h3>
            </div>
            <p className="text-3xl font-bold text-gray-800">{metrics.atl}</p>
            <p className="text-xs text-gray-500 mb-2">Charge aiguë</p>
            <p className="text-xs text-gray-600 leading-tight">Fatigue accumulée sur 7 jours. Augmente vite avec l'entraînement.</p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-4 hover:shadow-xl transition">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="text-blue-500" size={20} />
              <h3 className="font-semibold text-gray-700 text-sm">CTL (42j)</h3>
            </div>
            <p className="text-3xl font-bold text-gray-800">{metrics.ctl}</p>
            <p className="text-xs text-gray-500 mb-2">Charge chronique</p>
            <p className="text-xs text-gray-600 leading-tight">Forme/fitness accumulé sur 6 semaines. Plus c'est haut, meilleure est votre forme.</p>
          </div>

          <div className={`rounded-lg shadow-lg p-4 hover:shadow-xl transition ${getTSBColor(metrics.tsb)}`}>
            <div className="flex items-center gap-2 mb-2">
              <Heart size={20} />
              <h3 className="font-semibold text-sm">TSB</h3>
            </div>
            <p className="text-3xl font-bold">{metrics.tsb}</p>
            <p className="text-xs opacity-75 mb-2">Balance = CTL - ATL</p>
            <p className="text-xs leading-tight">
              {metrics.tsb < -10 ? '⚠️ Surmenage' :
               metrics.tsb < -5 ? '💪 Zone productive' :
               metrics.tsb < 5 ? '✅ Forme optimale' :
               metrics.tsb < 15 ? '🔋 Récupération' :
               '😴 Désentraînement'}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-4 hover:shadow-xl transition">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="text-purple-500" size={20} />
              <h3 className="font-semibold text-gray-700 text-sm">Semaine</h3>
            </div>
            <p className="text-3xl font-bold text-gray-800">{metrics.weeklyLoad}</p>
            <p className="text-xs text-gray-500 mb-2">TSS total</p>
            <p className="text-xs text-gray-600 leading-tight">Charge des 7 derniers jours. Objectif: 300-600 TSS/semaine.</p>
          </div>
        </div>

        {/* Sport Stats (30 derniers jours) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-3xl">🏃</span>
              <h3 className="font-bold text-lg">Course à pied</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Séances:</span>
                <span className="font-semibold">{sportStats.run.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Distance:</span>
                <span className="font-semibold">{(sportStats.run.distance || 0).toFixed(1)} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Durée:</span>
                <span className="font-semibold">{formatDuration(sportStats.run.duration || 0)}</span>
              </div>
              {sportStats.run.avgPace > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Allure moy:</span>
                  <span className="font-semibold">{formatPace(sportStats.run.avgPace)}/km</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">D+:</span>
                <span className="font-semibold">{Math.round(sportStats.run.elevation || 0)} m</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-3xl">🚴</span>
              <h3 className="font-bold text-lg">Vélo</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Séances:</span>
                <span className="font-semibold">{sportStats.bike.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Distance:</span>
                <span className="font-semibold">{(sportStats.bike.distance || 0).toFixed(1)} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Durée:</span>
                <span className="font-semibold">{formatDuration(sportStats.bike.duration || 0)}</span>
              </div>
              {sportStats.bike.avgSpeed > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Vitesse moy:</span>
                  <span className="font-semibold">{sportStats.bike.avgSpeed.toFixed(1)} km/h</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">D+:</span>
                <span className="font-semibold">{Math.round(sportStats.bike.elevation || 0)} m</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-3xl">🏊</span>
              <h3 className="font-bold text-lg">Natation</h3>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Séances:</span>
                <span className="font-semibold">{sportStats.swim.count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Distance:</span>
                <span className="font-semibold">{(sportStats.swim.distance || 0).toFixed(1)} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Durée:</span>
                <span className="font-semibold">{formatDuration(sportStats.swim.duration || 0)}</span>
              </div>
              {sportStats.swim.avgPace > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Allure moy:</span>
                  <span className="font-semibold">{formatPace(sportStats.swim.avgPace, true)}/100m</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Trend 12 semaines + Zones */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4">Tendance 12 semaines (ATL/CTL/TSB)</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="atl" stroke="#f59e0b" strokeWidth={2} name="ATL" />
                <Line type="monotone" dataKey="ctl" stroke="#3b82f6" strokeWidth={2} name="CTL" />
                <Line type="monotone" dataKey="tsb" stroke="#10b981" strokeWidth={2} name="TSB" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {zoneDistribution.length > 0 && (
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Target className="text-indigo-600" />
                Zones cardiaques (14j)
              </h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={zoneDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}%`}
                    outerRadius={70}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {zoneDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-1 text-xs">
                {zoneDistribution.map((zone, idx) => (
                  <div key={idx} className="flex justify-between">
                    <span style={{ color: zone.color }} className="font-semibold">{zone.name}</span>
                    <span>{formatDuration(zone.minutes)} ({zone.value}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recommendations */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <AlertCircle className="text-indigo-600" size={24} />
            Recommandations intelligentes
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommendations.map((rec, idx) => (
              <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg ${
                rec.type === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
                rec.type === 'success' ? 'bg-green-50 border border-green-200' :
                'bg-blue-50 border border-blue-200'
              }`}>
                {rec.type === 'warning' && <AlertCircle className="text-yellow-600 flex-shrink-0 mt-0.5" size={18} />}
                {rec.type === 'success' && <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />}
                {rec.type === 'info' && <AlertCircle className="text-blue-600 flex-shrink-0 mt-0.5" size={18} />}
                <p className="text-sm leading-tight">{rec.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Charts HRV et FC repos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4">HRV (Variabilité cardiaque) - 30j</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="hrv" stroke="#8b5cf6" strokeWidth={2} name="HRV (ms)" connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 mt-2">HRV élevée = bonne récupération • HRV en baisse = fatigue</p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4">FC au repos - 30j</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[40, 80]} />
                <Tooltip />
                <Line type="monotone" dataKey="restingHR" stroke="#ef4444" strokeWidth={2} name="FC repos (bpm)" connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 mt-2">FC repos qui augmente = signe de fatigue ou surentraînement</p>
          </div>
        </div>

        {/* Charge et Sommeil */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4">Charge d'entraînement (30j)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="tss" fill="#8b5cf6" name="TSS" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold mb-4">Sommeil (30j)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 10]} />
                <Tooltip />
                <Area type="monotone" dataKey="sleep" stroke="#3b82f6" fill="#93c5fd" name="Heures" />
              </AreaChart>
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
                      <p className="text-xs text-gray-500">{formatDate(act.date)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{(act.distance || 0).toFixed(1)} km</p>
                    <p className="text-xs text-gray-500">
                      {formatDuration(act.duration)} • {act.avgHR ? `${Math.round(act.avgHR)} bpm` : 'Pas de FC'}
                    </p>
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
                    <p className="font-semibold text-sm">{formatDate(sleep.date)}</p>
                    <p className="text-xs text-gray-500">Qualité: {sleep.quality}/100 • HRV: {sleep.hrv || 'N/A'} ms</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">{formatDuration(sleep.duration)}</p>
                    <p className="text-xs text-gray-500">Profond: {formatDuration(sleep.deepSleep)} • FC: {sleep.restingHR || 'N/A'} bpm</p>
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