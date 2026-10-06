import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';

const root=resolve('site');const port=Number(process.env.TABLEFLOW_SITE_PORT??4180);
createServer(async(request,response)=>{
  try {
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    let target=resolve(root,'.'+pathname);if(target!==root && !target.startsWith(root+sep))throw new Error('Outside site');
    if((await stat(target)).isDirectory())target=resolve(target,'index.html');
    const data=await readFile(target);response.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png'})[extname(target)]??'application/octet-stream'});response.end(data);
  } catch {response.writeHead(404).end('Not found');}
}).listen(port,'127.0.0.1',()=>console.log(`Static site preview: http://127.0.0.1:${port}/ (local development only).`));
