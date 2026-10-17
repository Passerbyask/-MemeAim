const path = require('node:path');
const fs = require('node:fs/promises');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.mp4':'video/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.txt':'text/plain','.svg':'image/svg+xml'};
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'";

function assetPath(root, address) {
  const url = new URL(address);
  if (url.protocol !== 'memeaim:' || url.host !== 'app' || url.username || url.password) throw new Error('Invalid origin');
  const name = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  if (/[\\\0:]/.test(name) || name.split('/').some(x => x === '..' || x === '.')) throw new Error('Invalid path');
  const file = path.resolve(root, '.' + name);
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || !types[path.extname(file)]) throw new Error('Invalid asset');
  return file;
}

function createAssetHandler(root) {
  return async request => {
    if (!['GET','HEAD'].includes(request.method)) return new Response(null, {status:405});
    let file;
    try { file = assetPath(root, request.url); } catch { return new Response(null, {status:403}); }
    try {
      const data = await fs.readFile(file);
      const headers = {'Content-Type':types[path.extname(file)],'Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Accept-Ranges':'bytes'};
      const range = request.headers.get('range');
      let start = 0, end = data.length - 1, status = 200;
      if (range) {
        const match = /^bytes=(\d+)-(\d*)$/.exec(range);
        if (!match) return new Response(null, {status:416,headers:{'Content-Range':`bytes */${data.length}`}});
        start = Number(match[1]);end = match[2] ? Math.min(Number(match[2]),end) : end;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= data.length) return new Response(null, {status:416,headers:{'Content-Range':`bytes */${data.length}`}});
        headers['Content-Range'] = `bytes ${start}-${end}/${data.length}`;status = 206;
      }
      headers['Content-Length'] = String(end-start+1);
      return new Response(request.method === 'HEAD' ? null : data.subarray(start,end+1), {status,headers});
    } catch { return new Response(null, {status:404}); }
  };
}
module.exports = {assetPath,createAssetHandler};
