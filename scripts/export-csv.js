const fs = require('fs');

function exportSleepToCSV() {
  const db = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));
  
  const csv = [
    'Date,Duration(min),Quality,DeepSleep(min),LightSleep(min),REMSleep(min),Awake(min),RestingHR,HRV'
  ];
  
  db.sleepData.forEach(s => {
    csv.push([
      s.date,
      s.duration,
      s.quality,
      s.deepSleep,
      s.lightSleep,
      s.remSleep,
      s.awake,
      s.restingHR || '',
      s.hrv || ''
    ].join(','));
  });
  
  fs.writeFileSync('sleep_export.csv', csv.join('\n'));
  console.log('✅ Export CSV créé: sleep_export.csv');
}

function exportActivitiesToCSV() {
  const db = JSON.parse(fs.readFileSync('./data/db.json', 'utf8'));
  
  const csv = [
    'Date,Name,Type,Duration(min),Distance(km),AvgHR,MaxHR,Elevation(m),TSS,Source'
  ];
  
  db.activities.forEach(a => {
    csv.push([
      a.date,
      `"${a.name || ''}"`,
      a.type,
      a.duration,
      a.distance || '',
      a.avgHR || '',
      a.maxHR || '',
      a.elevation || '',
      a.tss || '',
      a.source
    ].join(','));
  });
  
  fs.writeFileSync('activities_export.csv', csv.join('\n'));
  console.log('✅ Export CSV créé: activities_export.csv');
}

// Exécuter les deux exports
exportSleepToCSV();
exportActivitiesToCSV();