'use client';
import {useCallback,useEffect,useState} from 'react';
import {ArrowDown,ArrowUp,Camera,Check,Eye,Plus,RefreshCw,Upload} from 'lucide-react';
import {galleryCategories,galleryLimits,type GalleryAlbum,type GalleryPhoto} from '../lib/gallery-policy';
import {prepareGalleryUpload} from '../lib/gallery-upload';
import {GalleryViewer,galleryDate} from './gallery';

type Api=(path:string,body?:Record<string,any>)=>Promise<any>;
type Action=(path:string,body:Record<string,any>,message:string)=>Promise<void>;

function PhotoEditor({photo,index,count,disabled,onAction,onMove}:{photo:GalleryPhoto;index:number;count:number;disabled:boolean;onAction:Action;onMove:(step:number)=>void}){
 return <article className="gallery-photo-editor"><img src={photo.src} alt={photo.alt_text} width={photo.width} height={photo.height} loading="lazy"/><form onSubmit={event=>{event.preventDefault();const values=new FormData(event.currentTarget);onAction('gallery/photo-save',{id:photo.id,alt_text:values.get('alt_text'),caption:values.get('caption'),cover:values.get('cover')==='on'},'Photo details saved.');}}>
  <fieldset disabled={disabled}><label>Image description<input name="alt_text" defaultValue={photo.alt_text} required minLength={3} maxLength={200}/></label><label>Photo caption<textarea name="caption" defaultValue={photo.caption} maxLength={500} rows={2}/></label><label className="check-label"><input type="checkbox" name="cover" defaultChecked={!!photo.is_cover} disabled={!!photo.is_cover}/><span>{photo.is_cover?'Album cover':'Use as album cover'}</span></label><div className="gallery-photo-actions"><button className="secondary-btn" type="submit">Save photo</button><button className="secondary-btn" type="button" aria-label={'Move photo '+(index+1)+' up'} disabled={index===0} onClick={()=>onMove(-1)}><ArrowUp/></button><button className="secondary-btn" type="button" aria-label={'Move photo '+(index+1)+' down'} disabled={index===count-1} onClick={()=>onMove(1)}><ArrowDown/></button><button type="button" className="link-button" onClick={()=>onAction('gallery/photo-state',{id:photo.id,archived:true},'Photo moved to Removed photos. You can restore it.')}>Remove photo</button></div></fieldset>
 </form></article>;
}

export function GalleryManager({api}:{api:Api}){
 const [albums,setAlbums]=useState<GalleryAlbum[]>([]),[selectedId,setSelectedId]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[archived,setArchived]=useState(false),[preview,setPreview]=useState<GalleryAlbum|null>(null);
 const load=useCallback(async()=>{const data=await api('gallery/albums');setAlbums(data.albums);},[api]);
 useEffect(()=>{load().catch(error=>setError(error.message)).finally(()=>setLoading(false));},[load]);
 const album=albums.find(value=>value.id===selectedId),draft=!album||album.status==='Draft',photos=album?.photos.filter(photo=>!photo.archived)??[],removed=album?.photos.filter(photo=>photo.archived)??[];
 async function perform(action:()=>Promise<any>,success:string){setBusy(true);setError('');setMessage('');try{const result=await action();await load();setMessage(success);return result;}catch(error){setError(error instanceof Error?error.message:'Unable to save the gallery.');}finally{setBusy(false);}}
 const onAction:Action=async(path,body,success)=>{await perform(()=>api(path,body),success);};
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const values=new FormData(event.currentTarget);
  const result=await perform(()=>api('gallery/save',{...(album?{id:album.id}:{}),title:values.get('title'),caption:values.get('caption'),category:values.get('category'),event_date:values.get('event_date'),sort_order:Number(values.get('sort_order')),permission_confirmed:values.get('permission_confirmed')==='on',permission_reference:values.get('permission_reference')}),'Album draft saved.');
  if(result){setSelectedId(result.id);setArchived(false);}
 }
 async function upload(files:File[]){
  if(!album||!files.length)return;
  if(files.length>galleryLimits.batch){setError('Choose up to 10 photos at a time.');return;}
  if(files.length+photos.length>galleryLimits.photos){setError('An album can contain up to 20 photos.');return;}
  setBusy(true);setError('');setMessage('');let saved=0,duplicates=0;
  try{
   for(const [index,file] of files.entries()){
    setMessage(`Preparing photo ${index+1} of ${files.length}…`);
    const image=await prepareGalleryUpload(file);
    const response=await fetch('/api/gallery/upload?album_id='+album.id,{method:'POST',headers:{'Content-Type':'image/jpeg'},body:image});
    const data=await response.json() as {error?:string;duplicate?:boolean};if(!response.ok)throw new Error(data.error||'Photo upload failed.');
    if(data.duplicate)duplicates++;else saved++;
   }
   setMessage(`${saved} ${saved===1?'photo':'photos'} uploaded.${duplicates?' '+duplicates+' existing photos skipped.':''}`);
  }catch(error){setMessage(`${saved} photos uploaded before the upload stopped.`);setError((error instanceof Error?error.message:'Upload failed.')+' You can select the files again; existing photos will be skipped.');}
  finally{await load().catch(error=>setError(error.message));setBusy(false);}
 }
 function move(index:number,step:number){if(!album)return;const ids=photos.map(photo=>photo.id);[ids[index],ids[index+step]]=[ids[index+step],ids[index]];onAction('gallery/photo-order',{album_id:album.id,ids},'Photo order saved.');}
 return <div className="gallery-manager">
  <div className="gallery-manager-toolbar"><div><p>Share academy activities through photo albums.</p><small>Only published albums appear on the public website.</small></div><div><a className="secondary-btn" href="/#gallery" target="_blank" rel="noreferrer"><Eye/>Public gallery</a><button className="secondary-btn" disabled={busy} onClick={()=>perform(load,'Gallery refreshed.')} aria-label="Refresh gallery"><RefreshCw/></button><button className="btn" disabled={busy} onClick={()=>{setSelectedId('new');setArchived(false);setError('');setMessage('');}}><Plus/>Create album</button></div></div>
  {error&&<p className="error" role="alert">{error}</p>}{message&&<p className="gallery-notice" role="status">{message}</p>}
  {loading?<p role="status">Loading gallery albums…</p>:<div className="gallery-workspace"><aside className="panel gallery-albums"><div className="gallery-album-tabs"><button disabled={busy} aria-pressed={!archived} onClick={()=>setArchived(false)}>Active albums</button><button disabled={busy} aria-pressed={archived} onClick={()=>setArchived(true)}>Archived</button></div>{!albums.filter(value=>(value.status==='Archived')===archived).length?<div className="gallery-empty"><Camera/><p>{archived?'No archived albums.':'Create your first album to get started.'}</p></div>:albums.filter(value=>(value.status==='Archived')===archived).map(value=>{const cover=value.photos.find(photo=>!photo.archived&&photo.is_cover)||value.photos.find(photo=>!photo.archived);return <button type="button" className={'gallery-album-select '+(selectedId===value.id?'selected':'')} disabled={busy} key={value.id} onClick={()=>{setSelectedId(value.id);setError('');setMessage('');}}>{cover?<img src={cover.src} alt="" loading="lazy"/>:<Camera/>}<span><strong>{value.title}</strong><small>{value.category}{value.event_date?' · '+galleryDate(value.event_date):''}</small><span className={'badge '+(value.status==='Published'?'green':'amber')}>{value.status}</span><small>{value.photos.filter(photo=>!photo.archived).length} photos</small></span></button>;})}</aside>
   <section className="panel gallery-editor" aria-label="Gallery album editor">{!selectedId?<div className="gallery-empty"><Camera size={36}/><h3>Your academy, in moments.</h3><p>Select an album or create one. Upload photos, add captions and preview the album before publishing.</p></div>:<>
    <div className="gallery-editor-heading"><div><h2>{album?album.title:'New gallery album'}</h2><p>{album?album.status:'Create a draft, then add your photos.'}</p></div>{album&&<div className="gallery-editor-actions"><button className="secondary-btn" disabled={busy||!photos.length} onClick={()=>setPreview(album)}><Eye/>Preview</button>{album.status==='Published'?<button className="secondary-btn" disabled={busy} onClick={()=>onAction('gallery/status',{id:album.id,status:'Draft'},'Album unpublished. It is now editable as a private draft.')}>Unpublish to edit</button>:album.status==='Archived'?<button className="btn" disabled={busy} onClick={()=>onAction('gallery/status',{id:album.id,status:'Draft'},'Album restored as a private draft.')}>Restore draft</button>:<button className="btn" disabled={busy||!photos.length||!album.permission_confirmed} onClick={()=>onAction('gallery/status',{id:album.id,status:'Published'},'Album published. Refresh the public gallery to see it.')}><Check/>Publish album</button>}</div>}</div>
    {!draft&&<p className="gallery-notice">{album?.status==='Published'?'This album is public. Unpublish it before editing its details or photos.':'This album is archived and hidden from the public website. Restore it as a draft to edit it.'}</p>}
    <form className="panel-form two-col gallery-album-form" key={selectedId+album?.status} onSubmit={save}><fieldset disabled={busy||!draft}>
     <label>Album title<input name="title" defaultValue={album?.title} required minLength={3} maxLength={100}/></label><label>Category<select name="category" defaultValue={album?.category||'Training'}>{galleryCategories.map(value=><option key={value}>{value}</option>)}</select></label>
     <label>Event date<input name="event_date" type="date" defaultValue={album?.event_date}/></label><label>Display order<input name="sort_order" type="number" min={0} max={9999} defaultValue={album?.sort_order??0}/><small>Smaller numbers appear first.</small></label>
     <label className="full">Album caption<textarea name="caption" defaultValue={album?.caption} maxLength={800} rows={3}/></label>
     <label className="check-label full"><input type="checkbox" name="permission_confirmed" defaultChecked={!!album?.permission_confirmed}/><span>I confirm the academy may publish these photos, with permission from identifiable people and guardians where required.</span></label>
     <label className="full">Permission reference (internal, optional)<input name="permission_reference" defaultValue={album?.permission_reference} maxLength={400} placeholder="e.g. Event permissions held by the academy"/></label>
     <button className="btn" type="submit">{busy?'Saving…':album?'Save draft details':'Create draft album'}</button>
    </fieldset></form>
    {album&&<><div className="gallery-upload"><label className={'secondary-btn '+(!draft||busy?'disabled':'')}><Upload/>Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||!draft} onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value='';upload(files);}}/></label><p>JPEG, PNG or WebP · up to 10 photos at a time · 10 MB per original<br/>Photos are resized for the website. Maximum 20 photos per album.</p></div>
     {draft&&(!album.permission_confirmed||!photos.length)&&<p className="gallery-help">Add photos and save the publication permission above to enable Publish album.</p>}
     <div className="gallery-photo-list">{photos.map((photo,index)=><PhotoEditor key={photo.id+photo.alt_text+photo.caption+photo.is_cover} photo={photo} index={index} count={photos.length} disabled={busy||!draft} onAction={onAction} onMove={step=>move(index,step)}/>)}</div>
     {!!removed.length&&<details className="gallery-removed"><summary>Removed photos ({removed.length})</summary><p>These photos are hidden and retained for recovery.</p>{removed.map(photo=><div key={photo.id}><img src={photo.src} alt={photo.alt_text} loading="lazy"/><span>{photo.alt_text}</span><button className="secondary-btn" disabled={busy||!draft} onClick={()=>onAction('gallery/photo-state',{id:photo.id,archived:false},'Photo restored.')}>Restore photo</button></div>)}</details>}
     {album.status!=='Archived'&&<div className="gallery-archive"><p>Archive an album to hide it while retaining its photos and details.</p><button type="button" className="secondary-btn" disabled={busy} onClick={()=>onAction('gallery/status',{id:album.id,status:'Archived'},'Album archived. You can restore it as a draft.')}>Archive album</button></div>}
    </>}
   </>}</section>
  </div>}
  {preview&&<GalleryViewer album={preview} onClose={()=>setPreview(null)}/>}
 </div>;
}
