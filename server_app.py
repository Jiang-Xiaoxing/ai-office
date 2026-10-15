"""Independent local AI Office. No login is bundled; bind loopback only."""
from pathlib import Path
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn
from starlette.concurrency import run_in_threadpool

from detectors import detect_status, load_tools

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / 'static'
TOOLS = load_tools(BASE_DIR / 'config' / 'tools.json')
class StatusScan:
    """Share only an in-flight scan; keep no snapshots, timers or history."""
    def __init__(self):
        self.task = None

    async def read(self):
        if self.task is None:
            self.task = asyncio.create_task(run_in_threadpool(detect_status, TOOLS))
            self.task.add_done_callback(self.finished)
        return await asyncio.shield(self.task)

    def finished(self, task):
        if self.task is task:
            self.task = None
        # Observe errors even when all waiting clients disconnect.
        if not task.cancelled():
            task.exception()

    async def close(self):
        if self.task is not None:
            await asyncio.gather(self.task, return_exceptions=True)


scans = StatusScan()

@asynccontextmanager
async def lifespan(app):
    yield
    await scans.close()

app = FastAPI(title='AI Office', lifespan=lifespan)

@app.get('/api/status')
async def api_status():
    return JSONResponse(await scans.read(), headers={'Cache-Control': 'no-store'})

@app.get('/api/healthz')
def healthz():
    return {'ok': True}

app.mount('/static', StaticFiles(directory=str(STATIC_DIR)), name='static')

@app.get('/')
def index():
    return FileResponse(STATIC_DIR / 'index.html', media_type='text/html; charset=utf-8',
                        headers={'Cache-Control': 'no-cache'})

if __name__ == '__main__':
    uvicorn.run(app, host='127.0.0.1', port=8889, log_level='warning')
