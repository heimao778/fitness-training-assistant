const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const WEB = __dirname
const CORE_MODULES = ['data/plans.js', 'utils/engine.js', 'utils/store.js']
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' }

function buildCoreBundle() {
  const entries = CORE_MODULES.map(id => {
    const source = fs.readFileSync(path.join(ROOT, id), 'utf8')
    return `${JSON.stringify(id)}: function(module, exports, require) {\n${source}\n}`
  }).join(',\n')
  return `(function(global) {
    var modules = {${entries}};
    var cache = {};
    function normalize(from, request) {
      if (request[0] !== '.') return request;
      var base = from.split('/'); base.pop();
      request.split('/').forEach(function(part) {
        if (part === '..') base.pop();
        else if (part !== '.') base.push(part);
      });
      var id = base.join('/');
      return id.endsWith('.js') ? id : id + '.js';
    }
    function load(id) {
      if (cache[id]) return cache[id].exports;
      if (!modules[id]) throw new Error('Unknown shared module: ' + id);
      var module = { exports: {} }; cache[id] = module;
      modules[id](module, module.exports, function(request) { return load(normalize(id, request)); });
      return module.exports;
    }
    global.FitnessCore = {
      plans: load('data/plans.js'),
      engine: load('utils/engine.js'),
      store: load('utils/store.js')
    };
  })(window);`
}

function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/core.js') {
      res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' })
      res.end(buildCoreBundle())
      return
    }
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    const file = path.resolve(WEB, requested)
    if (!file.startsWith(`${WEB}${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found')
      return
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    fs.createReadStream(file).pipe(res)
  })
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4173)
  const server = createServer()
  server.listen(port, '127.0.0.1', () => {
    console.log(`浏览器预览已启动：http://127.0.0.1:${port}`)
    console.log('仅为本地交互预览，不代表微信开发者工具编译或真机验证。')
  })
}

module.exports = { buildCoreBundle, createServer }
