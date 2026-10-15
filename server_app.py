"""Independent local AI Office. No login is bundled; bind loopback only."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from detectors import detect_status, load_tools

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / 'static'
TOOLS = load_tools(BASE_DIR / 'config' / 'tools.json')
app = FastAPI(title='AI Office')

@app.get('/api/status')
def api_status():
    return JSONResponse(detect_status(TOOLS), headers={'Cache-Control': 'no-store'})

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
