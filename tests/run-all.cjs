/* All checks against this checkout. No start/stop scripts or production ports. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const http=require('node:http'),net=require('node:net');
const {spawn}=require('node:child_process');
const {PYTHON}=require('./test-env.cjs');
const ROOT=path.resolve(__dirname,'..'),TMP=path.join(ROOT,'.browser-tmp');
fs.mkdirSync(TMP,{recursive:true});
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(server.address().port));});
const close=server=>new Promise(resolve=>server.close(resolve));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function terminate(child) {
  if(!child.pid||child.exitCode!==null)return;
  if(process.platform!=='win32'){child.kill();return;}
  // A Windows venv redirector starts a second Python process. Killing only the
  // redirector can leave uvicorn listening, so terminate this owned tree.
  await new Promise((resolve,reject)=>{
    const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    killer.once('error',reject);
    killer.once('close',code=>code===0||child.exitCode!==null?resolve():reject(Error(`Could not close test process tree ${child.pid}`)));
  });
}
async function run(command,args,env) {
  console.log(`RUN ${args.join(' ')}`);
  await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:ROOT,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    child.stdout.on('data',data=>{process.stdout.write(data);fs.appendFileSync(path.join(TMP,'acceptance.log'),data);});
    child.stderr.on('data',data=>{process.stderr.write(data);fs.appendFileSync(path.join(TMP,'acceptance.log'),data);});
    const timer=setTimeout(()=>{terminate(child).then(()=>reject(Error(`Timed out: ${args[0]}`)),reject);},240000);
    child.once('error',e=>{clearTimeout(timer);reject(e);});
    child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`${args[0]} exited ${code}`));});
  });
}
(async()=>{
  const lifecycleOnly=process.argv.includes('--lifecycle-only');
  if(!lifecycleOnly)fs.writeFileSync(path.join(TMP,'acceptance.log'),'');
  // Existing tests refresh three historical screenshots. Restore their exact input bytes.
  const saved=new Map(['attic-idle.png','attic-work.png','attic-weather.png','attic-six.png','interaction-greeting.png','interaction-watering.png','interaction-tea.png','interaction-night.png','ui-day.png','ui-night.png','ui-narrow.png'].map(name=>{
    const file=path.join(ROOT,'preview',name);return [file,fs.readFileSync(file)];
  }));
  let service,serviceClosed,serviceURL,gateway,log;
  try {
    const probe=net.createServer(),port=await listen(probe);await close(probe);
    assert.notEqual(port,8889);assert.notEqual(port,8888);
    const BASE=`http://127.0.0.1:${port}`;
    serviceURL=BASE;
    log=fs.openSync(path.join(TMP,'test-server.log'),'w');
    service=spawn(PYTHON,['-m','uvicorn','server_app:app','--host','127.0.0.1','--port',String(port),'--log-level','warning','--no-access-log'],
      {cwd:ROOT,windowsHide:true,stdio:['ignore',log,log],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
    serviceClosed=new Promise(resolve=>service.once('close',resolve));
    let startupError;service.on('error',e=>{startupError=e;});
    for(let i=0;i<100;i++) {
      if(startupError)throw startupError;
      if(service.exitCode!==null)throw Error('Temporary office exited before readiness');
      if(await fetch(`${BASE}/api/healthz`).then(r=>r.ok).catch(()=>false))break;
      if(i===99)throw Error('Temporary office failed readiness');await pause(100);
    }
    if(lifecycleOnly){console.log(`PASS hidden temporary service lifecycle startup: ${BASE}`);return;}
    // An isolated authenticated reverse-proxy fixture exercises verify-site without
    // reading private-site credentials or pointing it at a different checkout.
    const auth=`Basic ${Buffer.from('fixture:local-only').toString('base64')}`;
    gateway=http.createServer((req,res)=>{
      if(req.headers.authorization!==auth||!req.url.startsWith('/office/')){res.writeHead(404);res.end();return;}
      const upstream=http.request(`${BASE}/${req.url.slice('/office/'.length)}`,{method:req.method},r=>{
        res.writeHead(r.statusCode,r.headers);r.pipe(res);
      });
      upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
    });
    const gatewayPort=await listen(gateway);
    const env={...process.env,OFFICE_URL:BASE,OFFICE_PYTHON:PYTHON,OFFICE_SITE_URL:`http://127.0.0.1:${gatewayPort}/office/`,
      OFFICE_SITE_AUTH:auth,TEMP:TMP,TMP:TMP,PYTHONDONTWRITEBYTECODE:'1'};
    console.log(`Temporary checkout service: ${BASE} (hidden, loopback only)`);
    await run(PYTHON,['tests/test_detectors.py'],env);
    await run(PYTHON,['tests/test_server.py'],env);
    await run(process.env.OFFICE_ART_PYTHON||'D:/AITools/py312/python.exe',['tests/verify_icon.py'],env);
    await run(process.env.OFFICE_ART_PYTHON||'D:/AITools/py312/python.exe',['tests/verify-assets.py'],env);
    for(const name of ['weather-clock','verify-office','verify-labels','verify-weather','verify-dynamic','verify-site','verify-interactions','verify-zones','verify-ui','verify-fill','verify-collisions','verify-lifecycle'])
      await run(process.execPath,[`tests/${name}.cjs`],env);
    await run(PYTHON,['tests/verify-memory.py'],env);
    await run(PYTHON,['tests/verify_screenshots.py'],env);
    await run(PYTHON,['tests/verify_screenshots.py','interaction-greeting.png','interaction-watering.png','interaction-tea.png','interaction-night.png'],env);
    await run(PYTHON,['tests/verify_screenshots.py','ui-day.png','ui-night.png'],env);
    console.log('PASS all existing and interaction checks (site check uses isolated authenticated fixture)');
  } finally {
    if(gateway)await close(gateway);
    if(service&&service.exitCode===null) {
      await terminate(service);await serviceClosed;
    }
    if(log!==undefined)fs.closeSync(log);
    for(const [file,bytes] of saved)fs.writeFileSync(file,bytes);
    if(serviceURL)assert(await fetch(`${serviceURL}/api/healthz`,{signal:AbortSignal.timeout(1000)}).then(()=>false,()=>true),
      'temporary test service port must be released');
    console.log('Temporary service and proxy closed; historical screenshots restored.');
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
