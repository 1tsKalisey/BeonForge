// Authored synthetic programs, passed as fixed Node eval bytes, never repository input.
export const SENTINEL = String.raw`
import fs from 'node:fs'; import net from 'node:net'; import process from 'node:process';
const denied = f => { try { f(); return false; } catch(e) { return ['EACCES','EPERM','ERR_ACCESS_DENIED'].includes(e.code); } };
const r = { allowedRead:false, allowedWrite:false, outsideReadDenied:false, outsideWriteDenied:false, readonlyWriteDenied:false, network:'inconclusive' };
try { r.allowedRead=fs.readFileSync('visible.txt','utf8')==='synthetic-visible'; } catch {}
try { fs.writeFileSync('out/allowed.txt','synthetic'); r.allowedWrite=fs.readFileSync('out/allowed.txt','utf8')==='synthetic'; } catch {}
r.outsideReadDenied=denied(()=>fs.readFileSync(process.argv[1]));
r.outsideWriteDenied=denied(()=>fs.writeFileSync(process.argv[2],'synthetic-mutation'));
r.readonlyWriteDenied=denied(()=>fs.writeFileSync('readonly-write.txt','synthetic'));
r.network=await new Promise(resolve=>{const s=net.connect({host:'127.0.0.1',port:Number(process.argv[3])});let done=false;const finish=v=>{if(done)return;done=true;s.destroy();resolve(v);};s.on('connect',()=>finish('connected'));s.on('error',e=>finish(['EACCES','EPERM'].includes(e.code)?'denied':'inconclusive'));s.setTimeout(750,()=>finish('inconclusive'));});
console.log(JSON.stringify(r));
`;

export const TREE = String.raw`
import {spawn} from 'node:child_process'; import process from 'node:process';
const mode=process.argv[1], source=process.execArgv[process.execArgv.indexOf('--eval')+1];
if(mode==='leaf') { setTimeout(()=>{},4000); }
else if(mode==='child') {
 const expiresAt=Date.now()+4000; const grand=spawn(process.execPath,['--input-type=module','--eval',source,'--','leaf'],{stdio:'ignore'});
 grand.unref(); process.stdout.end(JSON.stringify({child:process.pid,grand:grand.pid,expiresAt})+'\n'); setTimeout(()=>{},4000);
} else {
 const child=spawn(process.execPath,['--input-type=module','--eval',source,'--','child'],{stdio:['ignore','pipe','ignore']}); let text='';
 child.stdout.on('data',b=>{text+=b;if(text.length>1024)process.exit(2);if(text.includes('\n')){const ids=JSON.parse(text);child.stdout.destroy();child.unref();process.stdout.write(JSON.stringify({root:process.pid,...ids})+'\n');setTimeout(()=>process.exit(0),mode==='hold'?4000:300);}});
}
`;

export const PROFILE = `default_permissions = "preflight"
[windows]
sandbox = "mxc"
[analytics]
enabled = false
[permissions.preflight.filesystem]
":root" = "deny"
":minimal" = "read"
[permissions.preflight.filesystem.":workspace_roots"]
"." = "read"
"out/allowed.txt" = "write"
[permissions.preflight.network]
enabled = false
`;
