const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const sandbox={};vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/weather.js'),'utf8'),sandbox);
const at=sandbox.AtticWeather.weatherAt,HOUR=3600000;
for(const day of ['2026-01-01','2026-06-30','2026-10-15','2026-12-31']) {
  const seen=new Set();let previous;
  for(let hour=0;hour<24;hour++) {
    const timestamp=Date.parse(`${day}T${String(hour).padStart(2,'0')}:00:00+08:00`);
    const state=at(timestamp);
    assert.equal(state.hour,hour);assert.equal(state.nextChange,timestamp+HOUR);
    assert.equal(at(timestamp+HOUR-1).kind,state.kind,'stable for the whole hour');
    if(hour<6||hour>=18)assert.equal(state.kind,'night');
    else {seen.add(state.kind);assert.notEqual(state.kind,previous);}
    previous=state.kind;
  }
  assert.deepEqual([...seen].sort(),['cloudy','rain','snow','sunny']);
}
console.log('PASS Beijing 06:00/18:00, midnight/year boundaries, hourly stability, four daytime states');
