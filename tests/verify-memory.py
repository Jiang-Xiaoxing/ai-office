"""Measure a real server through concurrent HTTP bursts, without retaining scans."""
from concurrent.futures import ThreadPoolExecutor
import gc
import json
import os
from pathlib import Path
import time
import urllib.request
import psutil

base=os.environ.get('OFFICE_URL','http://127.0.0.1:8889')
port=int(base.rsplit(':',1)[1])
connection=next(c for c in psutil.net_connections(kind='tcp') if c.laddr.port==port and c.status=='LISTEN')
process=psutil.Process(connection.pid)
def fetch(_):
    with urllib.request.urlopen(base+'/api/status',timeout=20) as response:
        data=json.load(response)
    assert isinstance(data['agents'],list)
samples=[]
with ThreadPoolExecutor(max_workers=8) as pool:
    for i in range(24):
        list(pool.map(fetch,range(8)))
        gc.collect()
        samples.append(dict(rss=process.memory_info().rss,threads=process.num_threads(),handles=process.num_handles()))
        time.sleep(.25)
warm=samples[5:]
assert warm[-1]['rss']-warm[0]['rss']<12*1024*1024,samples
assert warm[-1]['threads']<=warm[0]['threads']+1,samples
assert warm[-1]['handles']<=warm[0]['handles']+8,samples
root=Path(__file__).resolve().parents[1]
(root/'.browser-tmp/memory-backend.json').write_text(json.dumps(samples,indent=2),'utf-8')
print(f'PASS 192 real status requests / 24 bursts: RSS {warm[0]["rss"]} -> {warm[-1]["rss"]}, threads {warm[0]["threads"]} -> {warm[-1]["threads"]}, handles {warm[0]["handles"]} -> {warm[-1]["handles"]}')
