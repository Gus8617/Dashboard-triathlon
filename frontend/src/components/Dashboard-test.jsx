
import React, { useState, useEffect } from 'react';

export default function Dashboard() {
  const [activities, setActivities] = useState([]);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadActivities();
  }, []);

  const loadActivities = async () => {
    try {
      const response = await fetch('/api/activities');
      const data = await response.json();
      console.log('Activités chargées:', data);
      setActivities(data);
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const syncStrava = async () => {
    setSyncing(true);
    try {
      console.log('Sync Strava...');
      const response = await fetch('/api/sync/strava', {
        method: 'POST'
      });
      const data = await response.json();
      console.log('Résultat sync:', data);
      
      if (data.success) {
        alert(`✅ ${data.newActivities} nouvelles activités !`);
        loadActivities();
      }
    } catch (error) {
      console.error('Erreur sync:', error);
      alert('Erreur: ' + error.message);
    }
    setSyncing(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard Triathlon TEST</h1>
      
      <button
        onClick={syncStrava}
        disabled={syncing}
        className="bg-blue-600 text-white px-6 py-3 rounded mb-6"
      >
        {syncing ? 'Synchronisation...' : 'Synchroniser Strava'}
      </button>
      
      <div className="bg-white rounded p-4">
        <h2 className="text-xl font-bold mb-4">
          Activités ({activities.length})
        </h2>
        {activities.length === 0 ? (
          <p>Aucune activité</p>
        ) : (
          <ul>
            {activities.slice(0, 10).map(act => (
              <li key={act.id} className="border-b py-2">
                {act.name || act.type} - {act.date}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

