'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Camera,Images,X} from 'lucide-react';
import {galleryCategories,type GalleryAlbum} from '../lib/gallery-policy';

export const galleryDate=(date:string)=>date?new Date(date+'T12:00:00+05:30').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Kolkata'}):'';

export function GalleryViewer({album,onClose}:{album:GalleryAlbum;onClose:()=>void}){
 const photos=album.photos.filter(p=>!p.archived),[index,setIndex]=useState(Math.max(0,photos.findIndex(p=>p.is_cover))),dialog=useRef<HTMLDialogElement>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{const node=dialog.current;node?.showModal();return()=>node?.close();},[]);
 useEffect(()=>setFailed(false),[index]);
 const move=(step:number)=>setIndex(current=>(current+step+photos.length)%photos.length);
 if(!photos.length)return null;
 const photo=photos[index];
 return <dialog ref={dialog} className="gallery-dialog" aria-labelledby="gallery-dialog-title" onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}} onKeyDown={event=>{if(event.key==='ArrowRight'){event.preventDefault();move(1);}if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}}}>
  <div className="gallery-dialog-inner"><header><div><p>{album.category}{album.event_date?' · '+galleryDate(album.event_date):''}</p><h2 id="gallery-dialog-title">{album.title}</h2></div><button type="button" onClick={onClose} aria-label="Close gallery"><X/></button></header>
   <div className="gallery-viewer-image">{failed?<p role="status">This photo is unavailable. Close the album and refresh the gallery.</p>:<img src={photo.src} alt={photo.alt_text} width={photo.width} height={photo.height} onError={()=>setFailed(true)}/>}</div>
   <footer><button type="button" className="secondary-btn" onClick={()=>move(-1)} disabled={photos.length===1} aria-label="Previous photo"><ArrowLeft/></button><div><p>{photo.caption||album.caption}</p><small>Photo {index+1} of {photos.length}</small></div><button type="button" className="secondary-btn" onClick={()=>move(1)} disabled={photos.length===1} aria-label="Next photo"><ArrowRight/></button></footer>
  </div>
 </dialog>;
}

export function PublicGallery(){
 const [albums,setAlbums]=useState<GalleryAlbum[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[category,setCategory]=useState('All activities'),[shown,setShown]=useState(6),[viewing,setViewing]=useState<GalleryAlbum|null>(null);
 const load=useCallback(async()=>{setError('');try{const response=await fetch('/api/gallery/public',{cache:'no-store'});if(!response.ok)throw new Error();const data=await response.json() as {albums:GalleryAlbum[]};setAlbums(data.albums);}catch{setError('The gallery could not be loaded. Please try again.');}finally{setLoading(false);}},[]);
 useEffect(()=>{load();const refresh=()=>{if(document.visibilityState==='visible')load();};document.addEventListener('visibilitychange',refresh);return()=>document.removeEventListener('visibilitychange',refresh);},[load]);
 const filtered=category==='All activities'?albums:albums.filter(album=>album.category===category);
 return <section className="section public-gallery" id="gallery" aria-labelledby="gallery-heading">
  <div className="section-top"><div><p className="eyebrow">LIFE AT THE ACADEMY</p><h2 id="gallery-heading">The practice.<br/>The people. <em>The moments.</em></h2></div><p>A closer look at training, milestones<br/>and our academy community.</p></div>
  {loading?<p role="status" className="gallery-empty">Loading academy moments…</p>:error?<div className="gallery-empty" role="alert"><p>{error}</p><button className="secondary-btn" onClick={load}>Try again</button></div>:!albums.length?<div className="gallery-empty"><Camera size={36}/><h3>Academy moments, coming soon.</h3><p>We’ll share photos from training and academy events here. In the meantime, come meet the team.</p><a className="text-button" href="tel:+918179190909">Arrange a visit <ArrowRight size={18}/></a></div>:<>
   <div className="gallery-filters" aria-label="Filter gallery albums">{['All activities',...galleryCategories.filter(value=>albums.some(album=>album.category===value))].map(value=><button type="button" key={value} aria-pressed={category===value} onClick={()=>{setCategory(value);setShown(6);}}>{value}</button>)}</div>
   <div className="gallery-grid">{filtered.slice(0,shown).map(album=>{const cover=album.photos.find(photo=>photo.is_cover)||album.photos[0];return <article className="gallery-card" key={album.id}><button type="button" onClick={()=>setViewing(album)} aria-label={'View album: '+album.title}><span className="gallery-cover"><img src={cover.src} alt={cover.alt_text} width={cover.width} height={cover.height} loading="lazy" decoding="async"/><span><Images size={14}/>{album.photos.length} {album.photos.length===1?'photo':'photos'}</span></span><span className="gallery-card-copy"><span className="gallery-meta">{album.category}{album.event_date?' · '+galleryDate(album.event_date):''}</span><span className="gallery-card-title">{album.title}</span>{album.caption&&<span className="gallery-caption">{album.caption}</span>}<span className="gallery-view-label">View photos <ArrowRight size={16}/></span></span></button></article>;})}</div>
   {filtered.length>shown&&<button className="secondary-btn gallery-more" onClick={()=>setShown(value=>value+6)}>More academy moments <ArrowRight size={16}/></button>}
  </>}
  {viewing&&<GalleryViewer album={viewing} onClose={()=>setViewing(null)}/>}
 </section>;
}
