import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

mkdirSync('.sites-runtime/gallery-tests',{recursive:true});
await build({entryPoints:['lib/academy.ts'],bundle:true,platform:'node',format:'esm',outfile:'.sites-runtime/gallery-tests/academy.mjs'});
const {academy}=await import('../.sites-runtime/gallery-tests/academy.mjs');
const owner={id:'gallery-owner',email:'owner@example.test',name:'Gallery Owner'};
const red=readFileSync('tests/fixtures/gallery-red.jpg'),blue=readFileSync('tests/fixtures/gallery-blue.jpg');
const details={title:'Fictional training event',caption:'Synthetic test images only.',category:'Training',event_date:'2026-11-10',sort_order:0,permission_confirmed:false,permission_reference:'Internal test consent reference'};
async function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON;');
 for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 const prepare=sql=>{let args=[];const statement={bind(...values){args=values;return statement;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async first(){return sqlite.prepare(sql).get(...args)??null;},async run(){const result=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}};return statement;};
 const db={prepare,async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const objects=new Map();const bucket={async put(key,value){objects.set(key,Uint8Array.from(value));},async get(key){return objects.has(key)?{body:objects.get(key),httpMetadata:{contentType:'image/jpeg'}}:null;},async head(key){return objects.has(key)?{key}:null;},async delete(key){objects.delete(key);}};
 async function call(path,body,identity=owner,headers={}){
  const binary=body instanceof Uint8Array;
  const response=await academy(new Request('https://academy.test/api/'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':binary?'image/jpeg':'application/json'}),...headers},body:body===undefined?undefined:binary?body:JSON.stringify(body)}),{db,bucket,identity,bootstrapEmail:owner.email});
  const data=response.headers.get('content-type')?.includes('application/json')?await response.json():new Uint8Array(await response.arrayBuffer());
  return {status:response.status,data,headers:response.headers};
 }
 await call('me');
 const identities={};for(const [index,role] of ['Admin','Coach','Parent','Student'].entries()){
  const id='gallery-role-'+index,email='gallery'+index+'@example.test';sqlite.prepare('INSERT INTO users(id,platform_id,email,name,role) VALUES(?,?,?,?,?)').run(id,id,email,role,role);identities[role]={id,email,name:role};
 }
 const album=async(overrides={})=>{const response=await call('gallery/save',{...details,...overrides});assert.equal(response.status,201,JSON.stringify(response.data));return response.data.id;};
 const upload=async(id,bytes=red)=>{const response=await call('gallery/upload?album_id='+id,bytes);assert.equal(response.status,201,JSON.stringify(response.data));return response.data.id;};
 const permit=async id=>{const response=await call('gallery/save',{...details,id,permission_confirmed:true});assert.equal(response.status,200,JSON.stringify(response.data));};
 return {sqlite,objects,bucket,call,album,upload,permit,identities};
}

test('only current administrators can manage albums or view draft photos',async()=>{
 const f=await fixture(),id=await f.album(),photo=await f.upload(id);
 assert.equal((await f.call('gallery/albums',undefined,null)).status,401);
 for(const role of ['Coach','Parent','Student']){
  assert.equal((await f.call('gallery/albums',undefined,f.identities[role])).status,403);
  assert.equal((await f.call('gallery/preview?id='+photo,undefined,f.identities[role])).status,403);
  assert.equal((await f.call('gallery/save',details,f.identities[role])).status,403);
 }
 assert.equal((await f.call('gallery/albums',undefined,f.identities.Admin)).status,200);
 assert.equal((await f.call('gallery/preview?id='+photo)).status,200);
 f.sqlite.prepare('UPDATE users SET active=0 WHERE id=?').run(f.identities.Admin.id);
 assert.equal((await f.call('gallery/albums',undefined,f.identities.Admin)).status,403);
});

test('publication requires a photo, saved permission and available object storage',async()=>{
 const f=await fixture(),id=await f.album();
 assert.equal((await f.call('gallery/status',{id,status:'Published'})).status,400);
 await f.permit(id);assert.equal((await f.call('gallery/status',{id,status:'Published'})).status,400);
 const photo=await f.upload(id),key=`gallery/${id}/${photo}`,bytes=f.objects.get(key);f.objects.delete(key);
 assert.equal((await f.call('gallery/status',{id,status:'Published'})).status,409);
 f.objects.set(key,bytes);assert.equal((await f.call('gallery/status',{id,status:'Published'})).status,200);
 assert.equal((await f.call('gallery/save',{...details,id})).status,409);
 assert.equal((await f.call('gallery/upload?album_id='+id,blue)).status,409);
 assert.throws(()=>f.sqlite.prepare('UPDATE gallery_photos SET caption=? WHERE id=?').run('Blocked edit',photo),/gallery_draft_required/);
});

test('anonymous responses contain only published gallery content and unpublishing revokes image access',async()=>{
 const f=await fixture(),id=await f.album(),photo=await f.upload(id);await f.permit(id);
 assert.deepEqual((await f.call('gallery/public',undefined,null)).data.albums,[]);
 assert.equal((await f.call('gallery/image?id='+photo,undefined,null)).status,404);
 await f.call('gallery/status',{id,status:'Published'});
 const published=await f.call('gallery/public',undefined,null);assert.equal(published.data.albums.length,1);
 const text=JSON.stringify(published.data);for(const privateField of ['object_key','sha256','permission_reference','created_by','Internal test consent reference'])assert.ok(!text.includes(privateField));
 const image=await f.call('gallery/image?id='+photo,undefined,null);assert.equal(image.status,200);assert.equal(image.headers.get('cache-control'),'no-store');assert.equal(image.headers.get('content-type'),'image/jpeg');
 await f.call('gallery/status',{id,status:'Draft'});
 assert.equal((await f.call('gallery/image?id='+photo,undefined,null)).status,404);
 assert.deepEqual((await f.call('gallery/public',undefined,null)).data.albums,[]);
 assert.equal((await f.call('gallery/preview?id='+photo)).status,200);
});

test('gallery images cannot be used to read private student objects or arbitrary keys',async()=>{
 const f=await fixture(),privateId=crypto.randomUUID();f.objects.set('students/private/'+privateId,red);
 assert.equal((await f.call('gallery/image?id='+privateId,undefined,null)).status,404);
 assert.equal((await f.call('gallery/preview?id='+privateId)).status,404);
 assert.equal((await f.call('gallery/save',{...details,object_key:'students/private/'+privateId})).status,400);
});

test('a concurrent archive cannot be overwritten by an in-flight publication',async()=>{
 const f=await fixture(),id=await f.album();await f.upload(id);await f.permit(id);
 const original=f.bucket.head;let archived=false;
 f.bucket.head=async key=>{if(!archived){archived=true;assert.equal((await f.call('gallery/status',{id,status:'Archived'})).status,200);}return original(key);};
 assert.equal((await f.call('gallery/status',{id,status:'Published'})).status,409);
 assert.equal(f.sqlite.prepare('SELECT status FROM gallery_albums WHERE id=?').get(id).status,'Archived');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='gallery.album_published'").get().n,0);
 assert.deepEqual((await f.call('gallery/public',undefined,null)).data.albums,[]);
});

test('uploads enforce origin, size and JPEG validation and strip metadata before deduplication',async()=>{
 const f=await fixture(),id=await f.album();
 assert.equal((await f.call('gallery/upload?album_id='+id,red,owner,{origin:'https://other.test'})).status,403);
 assert.equal((await f.call('gallery/upload?album_id='+id,red,owner,{'Content-Type':'image/svg+xml'})).status,415);
 assert.equal((await f.call('gallery/upload?album_id='+id,new Uint8Array(2097153))).status,413);
 assert.equal((await f.call('gallery/upload?album_id='+id,red.subarray(0,40))).status,400);
 const meta=Buffer.from('Exif\0\0GPS TEST PRIVATE METADATA');const segment=Buffer.concat([Buffer.from([255,225,(meta.length+2)>>8,(meta.length+2)&255]),meta]);
 const withMeta=Buffer.concat([red.subarray(0,2),segment,red.subarray(2)]),photo=await f.upload(id,withMeta);
 assert.ok(!Buffer.from(f.objects.get(`gallery/${id}/${photo}`)).includes(meta));
 const duplicate=await f.call('gallery/upload?album_id='+id,red);assert.equal(duplicate.status,200);assert.equal(duplicate.data.duplicate,true);assert.equal(duplicate.data.id,photo);
 assert.equal(f.objects.size,1);
});

test('photo ordering, cover choice, removal and recovery preserve album integrity',async()=>{
 const f=await fixture(),id=await f.album(),a=await f.upload(id),b=await f.upload(id,blue);
 assert.equal((await f.call('gallery/photo-order',{album_id:id,ids:[a,a]})).status,400);
 assert.equal((await f.call('gallery/photo-order',{album_id:id,ids:[b,a]})).status,200);
 assert.equal((await f.call('gallery/photo-save',{id:b,alt_text:'Synthetic blue photo',caption:'Blue test caption',cover:true})).status,200);
 assert.equal(f.sqlite.prepare('SELECT id FROM gallery_photos WHERE is_cover=1 AND archived=0').get().id,b);
 await f.call('gallery/photo-state',{id:b,archived:true});assert.equal(f.sqlite.prepare('SELECT id FROM gallery_photos WHERE is_cover=1 AND archived=0').get().id,a);
 await f.call('gallery/photo-state',{id:b,archived:false});assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM gallery_photos WHERE archived=0').get().n,2);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM gallery_photos WHERE is_cover=1 AND archived=0').get().n,1);
 assert.equal((await f.call('gallery/photo-save',{id:b,alt_text:'x',caption:'',cover:false})).status,400);
});

test('failed SQL writes roll back gallery records and clean up staged objects',async()=>{
 const f=await fixture(),id=await f.album();f.sqlite.exec("CREATE TRIGGER fail_gallery_audit BEFORE INSERT ON audit_logs WHEN NEW.action='gallery.photo_uploaded' BEGIN SELECT RAISE(ABORT,'gallery_simulated_failure'); END;");
 assert.equal((await f.call('gallery/upload?album_id='+id,red)).status,409);
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM gallery_photos').get().n,0);assert.equal(f.objects.size,0);
});

test('database guards cap active photos and reject publishing empty or unapproved albums',async()=>{
 const f=await fixture(),id=await f.album();
 assert.throws(()=>f.sqlite.prepare("UPDATE gallery_albums SET status='Published' WHERE id=?").run(id));
 for(let i=0;i<20;i++){const photo=crypto.randomUUID();f.sqlite.prepare('INSERT INTO gallery_photos(id,album_id,object_key,alt_text,width,height,byte_size,sha256,sort_order) VALUES(?,?,?,?,?,?,?,?,?)').run(photo,id,`gallery/${id}/${photo}`,'Synthetic test',4,3,100,String(i).padStart(64,'0'),i);}
 assert.equal((await f.call('gallery/upload?album_id='+id,red)).status,400);
});

test('backup restore preserves published and archived albums, captions, covers and object references',async()=>{
 const f=await fixture(),published=await f.album(),archived=await f.album({title:'Archived synthetic event'});await f.upload(published);await f.permit(published);await f.call('gallery/status',{id:published,status:'Published'});await f.upload(archived,blue);await f.call('gallery/status',{id:archived,status:'Archived'});
 const backup=(await f.call('backup')).data;assert.equal(backup.gallery_albums.length,2);assert.equal(backup.gallery_photos.length,2);
 const base='.sites-runtime/gallery-tests/'+crypto.randomUUID(),input=base+'.json',output=base+'.sql';writeFileSync(input,JSON.stringify(backup));
 const converted=spawnSync(process.execPath,['scripts/backup-to-sql.mjs',input,output],{encoding:'utf8'});assert.equal(converted.status,0,converted.stderr);
 const restored=new DatabaseSync(':memory:');restored.exec('PRAGMA foreign_keys=ON;');for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())restored.exec(readFileSync('drizzle/'+file,'utf8'));restored.exec(readFileSync(output,'utf8'));
 assert.equal(restored.prepare('SELECT status FROM gallery_albums WHERE id=?').get(published).status,'Published');assert.equal(restored.prepare('SELECT status FROM gallery_albums WHERE id=?').get(archived).status,'Archived');
 assert.equal(restored.prepare('SELECT COUNT(*) n FROM gallery_photos').get().n,2);assert.equal(restored.prepare('SELECT COUNT(*) n FROM gallery_photos WHERE is_cover=1').get().n,2);
});
