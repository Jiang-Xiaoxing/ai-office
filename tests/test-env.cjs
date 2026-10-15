/* Isolate worktree checks from the operator's running office. */
const path=require('node:path'),fs=require('node:fs');
const ROOT=path.resolve(__dirname,'..');
const localPython=path.join(ROOT,'venv/Scripts/python.exe');
module.exports={
  BASE:(process.env.OFFICE_URL||'http://127.0.0.1:8889').replace(/\/$/,''),
  PYTHON:process.env.OFFICE_PYTHON||(fs.existsSync(localPython)?localPython:'D:/ai-office/venv/Scripts/python.exe'),
};
