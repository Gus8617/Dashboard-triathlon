import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Calendar, Clock, Activity, TrendingUp } from 'lucide-react';

export default function CalendarView({ onBack }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activities, setActivities] = useState([]);
  const [plannedActivities, setPlannedActivities] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [newActivity, setNewActivity] = useState({
    type: 'run',
    name: '',
    duration: 60,
    distance: 10,
    notes: ''
  });

  useEffect(() => {
    loadActivities();
    loadPlannedActivities();
  }, []);

  const loadActivities = async () => {
    try {
      const response = await fetch('/api/activities');
      const data = await response.json();
      setActivities(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Erreur chargement activités:', error);
    }
  };

  const loadPlannedActivities = () => {
    // Charger depuis localStorage
    const stored = localStorage.getItem('plannedActivities');
    if (stored) {
      setPlannedActivities(JSON.parse(stored));
    }
  };

  const savePlannedActivities = (activities) => {
    localStorage.setItem('plannedActivities', JSON.stringify(activities));
    setPlannedActivities(activities);
  };

  const getWeekNumber = (date) => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    // Correction : le premier jour de la semaine en France est Lundi (pas Dimanche)
    let startingDayOfWeek = firstDay.getDay();
    // Convertir : Dimanche (0) devient 7, et déplacer tout pour que Lundi = 0
    startingDayOfWeek = startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1;
    
    const days = [];
    
    // Jours du mois précédent
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false
      });
    }
    
    // Jours du mois actuel
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }
    
    // Jours du mois suivant pour compléter la grille
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }
    
    return days;
  };

  const getActivitiesForDate = (date) => {
    // IMPORTANT : Créer la date en heure locale pour éviter le décalage
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const realized = activities.filter(a => a.date === dateStr);
    const planned = plannedActivities.filter(a => a.date === dateStr);
    return { realized, planned };
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleAddActivity = () => {
    if (!selectedDate || !newActivity.name) return;
    
    // Créer la date string en heure locale
    const year = selectedDate.getFullYear();
    const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const day = String(selectedDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const activity = {
      id: Date.now(),
      date: dateStr,
      ...newActivity,
      status: 'planned'
    };
    
    savePlannedActivities([...plannedActivities, activity]);
    setShowAddModal(false);
    setNewActivity({ type: 'run', name: '', duration: 60, distance: 10, notes: '' });
    setSelectedDate(null);
  };

  const handleDeletePlanned = (id) => {
    savePlannedActivities(plannedActivities.filter(a => a.id !== id));
  };

  const getActivityIcon = (type) => {
    switch(type) {
      case 'run': return '🏃';
      case 'bike': return '🚴';
      case 'swim': return '🏊';
      default: return '💪';
    }
  };

  const formatDuration = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h${mins > 0 ? mins.toString().padStart(2, '0') : ''}` : `${mins}min`;
  };

  const isToday = (date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const days = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  // Calculer les semaines
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  // Stats du mois
  const monthActivities = activities.filter(a => {
    // Parser la date correctement en heure locale
    const [year, month, day] = a.date.split('-').map(Number);
    const actDate = new Date(year, month - 1, day);
    return actDate.getMonth() === currentDate.getMonth() && 
           actDate.getFullYear() === currentDate.getFullYear();
  });
  
  const monthPlanned = plannedActivities.filter(a => {
    // Parser la date correctement en heure locale
    const [year, month, day] = a.date.split('-').map(Number);
    const actDate = new Date(year, month - 1, day);
    return actDate.getMonth() === currentDate.getMonth() && 
           actDate.getFullYear() === currentDate.getFullYear();
  });

  const monthStats = {
    realized: monthActivities.length,
    planned: monthPlanned.length,
    total: monthActivities.length + monthPlanned.length,
    distance: monthActivities.reduce((sum, a) => sum + (a.distance || 0), 0),
    duration: monthActivities.reduce((sum, a) => sum + (a.duration || 0), 0)
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-2">📅 Planning d'entraînement</h1>
            <p className="text-gray-600">Visualisez et planifiez vos séances</p>
          </div>
          <button
            onClick={onBack}
            className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg transition"
          >
            ← Retour
          </button>
        </div>

        {/* Stats du mois */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600 mb-1">Séances réalisées</p>
            <p className="text-3xl font-bold text-green-600">{monthStats.realized}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600 mb-1">Séances planifiées</p>
            <p className="text-3xl font-bold text-blue-600">{monthStats.planned}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600 mb-1">Distance totale</p>
            <p className="text-3xl font-bold text-purple-600">{monthStats.distance.toFixed(0)} km</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <p className="text-sm text-gray-600 mb-1">Temps total</p>
            <p className="text-3xl font-bold text-orange-600">{formatDuration(monthStats.duration)}</p>
          </div>
        </div>

        {/* Navigation mois */}
        <div className="bg-white rounded-lg shadow-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <button
              onClick={handlePrevMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ChevronLeft size={24} />
            </button>
            <h2 className="text-2xl font-bold capitalize">{monthName}</h2>
            <button
              onClick={handleNextMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>

        {/* Calendrier */}
        <div className="bg-white rounded-lg shadow-lg p-4 overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr>
                <th className="w-12 text-xs font-semibold text-gray-600 pb-2">S</th>
                <th className="text-sm font-semibold text-gray-600 pb-2">Lun</th>
                <th className="text-sm font-semibold text-gray-600 pb-2">Mar</th>
                <th className="text-sm font-semibold text-gray-600 pb-2">Mer</th>
                <th className="text-sm font-semibold text-gray-600 pb-2">Jeu</th>
                <th className="text-sm font-semibold text-gray-600 pb-2">Ven</th>
                <th className="text-sm font-semibold text-gray-600 pb-2">Sam</th>
                <th className="text-sm font-semibold text-gray-600 pb-2">Dim</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, weekIdx) => {
                const weekNumber = getWeekNumber(week[0].date);
                return (
                  <tr key={weekIdx}>
                    <td className="text-center text-xs font-bold text-gray-400 border-r border-gray-200">
                      {weekNumber}
                    </td>
                    {week.map((day, dayIdx) => {
                      const { realized, planned } = getActivitiesForDate(day.date);
                      const today = isToday(day.date);
                      
                      return (
                        <td
                          key={dayIdx}
                          className={`border border-gray-200 p-2 align-top h-24 ${
                            !day.isCurrentMonth ? 'bg-gray-50' : ''
                          } ${today ? 'bg-blue-50 border-blue-400' : ''} hover:bg-gray-50 transition cursor-pointer`}
                          onClick={() => {
                            if (day.isCurrentMonth) {
                              setSelectedDate(day.date);
                              setShowAddModal(true);
                            }
                          }}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className={`text-sm font-semibold ${
                              !day.isCurrentMonth ? 'text-gray-400' : today ? 'text-blue-600' : 'text-gray-700'
                            }`}>
                              {day.date.getDate()}
                            </span>
                            {day.isCurrentMonth && (
                              <Plus size={14} className="text-gray-400 hover:text-blue-600" />
                            )}
                          </div>
                          
                          <div className="space-y-1">
                            {realized.map((act, idx) => (
                              <div
                                key={idx}
                                className="text-xs bg-green-100 text-green-800 px-1 py-0.5 rounded truncate"
                                title={act.name}
                              >
                                {getActivityIcon(act.type)} {act.distance?.toFixed(1)}km
                              </div>
                            ))}
                            {planned.map((act) => (
                              <div
                                key={act.id}
                                className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded flex items-center justify-between group"
                                title={act.name}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="truncate">{getActivityIcon(act.type)} {act.name}</span>
                                <X
                                  size={12}
                                  className="ml-1 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-red-600"
                                  onClick={() => handleDeletePlanned(act.id)}
                                />
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Légende */}
        <div className="mt-4 bg-white rounded-lg shadow p-4">
          <h3 className="font-bold mb-2">Légende :</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-100 border border-green-300 rounded"></div>
              <span>Séance réalisée</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
              <span>Séance planifiée</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-50 border border-blue-400 rounded"></div>
              <span>Aujourd'hui</span>
            </div>
          </div>
        </div>

        {/* Modal Ajouter séance */}
        {showAddModal && selectedDate && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold">Planifier une séance</h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedDate(null);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  {selectedDate.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2">Type de séance</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'run', label: '🏃 Course', color: 'orange' },
                      { value: 'bike', label: '🚴 Vélo', color: 'blue' },
                      { value: 'swim', label: '🏊 Natation', color: 'cyan' }
                    ].map(type => (
                      <button
                        key={type.value}
                        onClick={() => setNewActivity({ ...newActivity, type: type.value })}
                        className={`p-3 rounded-lg border-2 text-sm font-semibold transition ${
                          newActivity.type === type.value
                            ? `border-${type.color}-500 bg-${type.color}-50`
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Nom de la séance *</label>
                  <input
                    type="text"
                    value={newActivity.name}
                    onChange={(e) => setNewActivity({ ...newActivity, name: e.target.value })}
                    placeholder="Ex: Sortie longue, Fractionné 10x400m..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2">Durée (min)</label>
                    <input
                      type="number"
                      value={newActivity.duration}
                      onChange={(e) => setNewActivity({ ...newActivity, duration: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2">Distance (km)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newActivity.distance}
                      onChange={(e) => setNewActivity({ ...newActivity, distance: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">Notes (optionnel)</label>
                  <textarea
                    value={newActivity.notes}
                    onChange={(e) => setNewActivity({ ...newActivity, notes: e.target.value })}
                    placeholder="Zones cibles, objectifs, remarques..."
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedDate(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold"
                >
                  Annuler
                </button>
                <button
                  onClick={handleAddActivity}
                  disabled={!newActivity.name}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-semibold"
                >
                  Ajouter
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}