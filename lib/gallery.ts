import {z} from 'zod';
import {galleryAlbumSchema,galleryLimits,sanitiseGalleryJpeg} from './gallery-policy';

type Row=Record<string,any>;
type Options={db:D1Database;bucket?:R2Bucket;user?:{id:string;role:string}};
class GalleryError extends Error {constructor(public status:number,message:string){super(message);}}
const fail=(status:number,message:string):never=>{throw new GalleryError(status,message);};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const idSchema=z.string().uuid();
async function limitedBytes(request:Request,limit:number){
 if(Number(request.headers.get('content-length'))>limit)fail(413,'This photo or request is too large.');
 const reader=request.body?.getReader();if(!reader)fail(400,'No upload was received.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {done,value}=await reader!.read();if(done)break;size+=value.byteLength;if(size>limit){await reader!.cancel();fail(413,'This photo or request is too large.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}

export async function gallery(request:Request,{db,bucket,user}:Options):Promise<Response|null>{
 const url=new URL(request.url),route=url.pathname.replace(/^\/api\//,'');
 if(!route.startsWith('gallery/'))return null;
 const publicRoute=request.method==='GET'&&['gallery/public','gallery/image'].includes(route);
 if(!publicRoute&&!user)return null;
 const q=(sql:string,...args:any[])=>db.prepare(sql).bind(...args);
 const all=async(sql:string,...args:any[])=>(await q(sql,...args).all<Row>()).results;
 const first=(sql:string,...args:any[])=>q(sql,...args).first<Row>();
 const audit=(action:string,id:string)=>q('INSERT INTO audit_logs(id,user_id,action,entity_id,detail) VALUES(?,?,?,?,?)',crypto.randomUUID(),user!.id,action,id,'Gallery content management');
 const touch=(id:string)=>q("UPDATE gallery_albums SET updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?",id);
 const draft=async(id:string)=>{const album=await first('SELECT * FROM gallery_albums WHERE id=?',id);if(!album)fail(404,'Album not found.');if(album!.status!=='Draft')fail(409,'Unpublish or restore this album before editing it.');return album!;};
 const photoShape=(p:Row,preview:boolean)=>({id:p.id,alt_text:p.alt_text,caption:p.caption,width:p.width,height:p.height,sort_order:p.sort_order,is_cover:p.is_cover,...(preview?{archived:p.archived}:{}),src:`/api/gallery/${preview?'preview':'image'}?id=${p.id}`});
 try{
  if(!publicRoute&&!['Admin','Super Admin'].includes(user!.role))fail(403,'Administrator access required.');
  if(route==='gallery/public'||route==='gallery/albums'){
   if(request.method!=='GET')fail(405,'Method not allowed.');
   const preview=route==='gallery/albums';
   const albums=await all(`SELECT * FROM gallery_albums ${preview?'':"WHERE status='Published' AND permission_confirmed=1 AND EXISTS(SELECT 1 FROM gallery_photos p WHERE p.album_id=gallery_albums.id AND p.archived=0)"} ORDER BY sort_order,event_date DESC,created_at DESC`);
   const photos=await all(`SELECT p.* FROM gallery_photos p JOIN gallery_albums a ON a.id=p.album_id ${preview?'':"WHERE a.status='Published' AND a.permission_confirmed=1 AND p.archived=0"} ORDER BY p.sort_order,p.created_at,p.id`);
   return json({albums:albums.map(a=>({id:a.id,title:a.title,caption:a.caption,category:a.category,event_date:a.event_date,sort_order:a.sort_order,...(preview?{status:a.status,permission_confirmed:a.permission_confirmed,permission_reference:a.permission_reference}:{}),photos:photos.filter(p=>p.album_id===a.id).map(p=>photoShape(p,preview))}))});
  }
  if(['gallery/image','gallery/preview'].includes(route)){
   if(request.method!=='GET')fail(405,'Method not allowed.');
   const id=idSchema.parse(url.searchParams.get('id'));
   const photo=await first(`SELECT p.* FROM gallery_photos p JOIN gallery_albums a ON a.id=p.album_id WHERE p.id=? ${route==='gallery/image'?"AND p.archived=0 AND a.status='Published' AND a.permission_confirmed=1":''}`,id);
   if(!photo||!bucket||photo.object_key!==`gallery/${photo.album_id}/${photo.id}`)fail(404,'Photo not found.');
   const object=await bucket!.get(photo!.object_key);if(!object)fail(404,'Photo not found.');
   return new Response(object!.body,{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
  if(request.method!=='POST')fail(405,'Method not allowed.');
  if(route==='gallery/upload'){
   const albumId=idSchema.parse(url.searchParams.get('album_id'));const album=await draft(albumId);
   if(!bucket)fail(503,'Gallery file storage is not configured.');
   if(request.headers.get('content-type')?.split(';')[0]!=='image/jpeg')fail(415,'Upload photos using the Gallery photo picker.');
   const input=await limitedBytes(request,galleryLimits.uploadBytes);
   let image:ReturnType<typeof sanitiseGalleryJpeg>;
   try{image=sanitiseGalleryJpeg(input);}catch{fail(400,'The image is invalid. Choose a JPEG, PNG or WebP photo using the photo picker.');}
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',image!.bytes as BufferSource))).map(b=>b.toString(16).padStart(2,'0')).join('');
   const duplicate=await first('SELECT id,archived FROM gallery_photos WHERE album_id=? AND sha256=?',albumId,digest);
   if(duplicate){if(duplicate.archived)fail(409,'This photo was removed earlier. Restore it from Removed photos.');return json({id:duplicate.id,duplicate:true});}
   if((await first('SELECT COUNT(*) n FROM gallery_photos WHERE album_id=? AND archived=0',albumId))!.n>=galleryLimits.photos)fail(400,'An album can contain up to 20 photos.');
   const id=crypto.randomUUID(),key=`gallery/${albumId}/${id}`;
   await bucket!.put(key,image!.bytes as ArrayBufferView,{httpMetadata:{contentType:'image/jpeg'}});
   try{
    await db.batch([
     q('INSERT INTO gallery_photos(id,album_id,object_key,alt_text,width,height,byte_size,sha256,sort_order,is_cover) VALUES(?,?,?,?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM gallery_photos WHERE album_id=?),CASE WHEN EXISTS(SELECT 1 FROM gallery_photos WHERE album_id=? AND archived=0 AND is_cover=1) THEN 0 ELSE 1 END)',id,albumId,key,album.title,image!.width,image!.height,image!.bytes.length,digest,albumId,albumId),
     touch(albumId),audit('gallery.photo_uploaded',id),
    ]);
   }catch(error){try{await bucket!.delete(key);}catch{console.error('Gallery orphan cleanup needed',{photoId:id});}throw error;}
   return json({id},201);
  }
  let input:unknown;try{input=JSON.parse(new TextDecoder().decode(await limitedBytes(request,25000)));}catch(error){if(error instanceof GalleryError)throw error;fail(400,'Invalid JSON request.');}
  if(route==='gallery/save'){
   const v=galleryAlbumSchema.parse(input),id=v.id??crypto.randomUUID();
   if(v.id)await draft(v.id);
   else if((await first("SELECT COUNT(*) n FROM gallery_albums WHERE status!='Archived'"))!.n>=galleryLimits.albums)fail(400,'Archive an unused album before creating another. The active album limit is 50.');
   await db.batch([
    v.id?q('UPDATE gallery_albums SET title=?,caption=?,category=?,event_date=?,sort_order=?,permission_confirmed=?,permission_reference=? WHERE id=?',v.title,v.caption,v.category,v.event_date,v.sort_order,v.permission_confirmed?1:0,v.permission_reference,id):q('INSERT INTO gallery_albums(id,title,caption,category,event_date,sort_order,permission_confirmed,permission_reference,created_by) VALUES(?,?,?,?,?,?,?,?,?)',id,v.title,v.caption,v.category,v.event_date,v.sort_order,v.permission_confirmed?1:0,v.permission_reference,user!.id),
    touch(id),audit(v.id?'gallery.album_updated':'gallery.album_created',id),
   ]);return json({id},v.id?200:201);
  }
  if(route==='gallery/status'){
   const v=z.object({id:idSchema,status:z.enum(['Draft','Published','Archived'])}).strict().parse(input);
   const album=await first('SELECT * FROM gallery_albums WHERE id=?',v.id);if(!album)fail(404,'Album not found.');
   if(v.status==='Published'){
    if(album!.status!=='Draft')fail(409,'Only a draft album can be published.');
    if(!album!.permission_confirmed)fail(400,'Confirm publication permission in the album details first.');
    const photos=await all('SELECT * FROM gallery_photos WHERE album_id=? AND archived=0',v.id);
    if(!photos.length)fail(400,'Upload at least one photo before publishing.');
    if(!bucket)fail(503,'Gallery file storage is not configured.');
    for(const photo of photos)if(photo.object_key!==`gallery/${v.id}/${photo.id}`||!await bucket!.head(photo.object_key))fail(409,'An album photo is missing from storage. Remove it or restore its file before publishing.');
   }
   const changed=await db.batch([
    q("UPDATE gallery_albums SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status=?",v.status,v.id,album!.status),
    q('INSERT INTO audit_logs(id,user_id,action,entity_id,detail) SELECT ?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),user!.id,`gallery.album_${v.status.toLowerCase()}`,v.id,'Gallery content management'),
   ]);
   if(changed[0].meta.changes!==1)fail(409,'The album status changed while this request was running. Refresh it before trying again.');
   return json({ok:true});
  }
  if(route==='gallery/photo-save'){
   const v=z.object({id:idSchema,alt_text:z.string().trim().min(3).max(200),caption:z.string().trim().max(500),cover:z.boolean()}).strict().parse(input);
   const photo=await first('SELECT * FROM gallery_photos WHERE id=? AND archived=0',v.id);if(!photo)fail(404,'Photo not found.');await draft(photo!.album_id);
   await db.batch([
    ...(v.cover?[q('UPDATE gallery_photos SET is_cover=0 WHERE album_id=?',photo!.album_id)]:[]),
    q('UPDATE gallery_photos SET alt_text=?,caption=?,is_cover=? WHERE id=?',v.alt_text,v.caption,v.cover?1:photo!.is_cover,v.id),
    touch(photo!.album_id),audit('gallery.photo_updated',v.id),
   ]);return json({ok:true});
  }
  if(route==='gallery/photo-state'){
   const v=z.object({id:idSchema,archived:z.boolean()}).strict().parse(input);
   const photo=await first('SELECT * FROM gallery_photos WHERE id=?',v.id);if(!photo)fail(404,'Photo not found.');await draft(photo!.album_id);
   await db.batch([
    q('UPDATE gallery_photos SET archived=?,is_cover=0 WHERE id=?',v.archived?1:0,v.id),
    q('UPDATE gallery_photos SET is_cover=1 WHERE id=(SELECT id FROM gallery_photos WHERE album_id=? AND archived=0 ORDER BY sort_order,created_at,id LIMIT 1) AND NOT EXISTS(SELECT 1 FROM gallery_photos WHERE album_id=? AND archived=0 AND is_cover=1)',photo!.album_id,photo!.album_id),
    touch(photo!.album_id),audit(v.archived?'gallery.photo_removed':'gallery.photo_restored',v.id),
   ]);return json({ok:true});
  }
  if(route==='gallery/photo-order'){
   const v=z.object({album_id:idSchema,ids:z.array(idSchema).min(1).max(galleryLimits.photos)}).strict().parse(input);await draft(v.album_id);
   const photos=await all('SELECT id FROM gallery_photos WHERE album_id=? AND archived=0',v.album_id);
   if(new Set(v.ids).size!==v.ids.length||v.ids.length!==photos.length||photos.some(p=>!v.ids.includes(p.id)))fail(400,'Refresh the album before reordering its photos.');
   await db.batch([...v.ids.map((id,index)=>q('UPDATE gallery_photos SET sort_order=? WHERE id=? AND album_id=?',index,id,v.album_id)),touch(v.album_id),audit('gallery.photos_reordered',v.album_id)]);
   return json({ok:true});
  }
  return json({error:'Gallery endpoint not found.'},404);
 }catch(error){
  if(error instanceof GalleryError)return json({error:error.message},error.status);
  if(error instanceof z.ZodError)return json({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},400);
  const message=error instanceof Error?error.message:'';
  if(/gallery_/i.test(message))return json({error:'The album changed or reached a limit. Refresh it, keep it as a draft, and check the photos and publication permission.'},409);
  throw error;
 }
}
