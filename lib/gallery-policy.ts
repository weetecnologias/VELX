import {z} from 'zod';
import {day} from './validation';

export const galleryCategories=['Training','Belt examinations','Competitions','Academy events','Facilities','Other'] as const;
export const galleryLimits={albums:50,photos:20,batch:10,originalBytes:10*1024*1024,uploadBytes:2*1024*1024,longEdge:1600};
export const galleryAlbumSchema=z.object({
 id:z.string().uuid().optional(), title:z.string().trim().min(3).max(100), caption:z.string().trim().max(800).default(''),
 category:z.enum(galleryCategories), event_date:z.union([day,z.literal('')]).default(''),
 sort_order:z.coerce.number().int().min(0).max(9999).default(0),
 permission_confirmed:z.boolean().default(false), permission_reference:z.string().trim().max(400).default(''),
}).strict();
export type GalleryPhoto={id:string;alt_text:string;caption:string;width:number;height:number;sort_order:number;is_cover:number;archived?:number;src:string};
export type GalleryAlbum={id:string;title:string;caption:string;category:string;event_date:string;sort_order:number;status?:'Draft'|'Published'|'Archived';permission_confirmed?:number;permission_reference?:string;photos:GalleryPhoto[]};

// JPEG segment layout: ITU-T T.81, Annex B. Discard application/comment metadata
// independently of the browser's image conversion, so direct uploads cannot
// retain EXIF/GPS, XMP, comments or embedded thumbnails.
export function sanitiseGalleryJpeg(input:Uint8Array){
 const invalid=()=>{throw new Error('Choose a valid JPEG, PNG or WebP photo through the upload form.');};
 if(input.length<20||input.length>galleryLimits.uploadBytes||input[0]!==255||input[1]!==216||input.at(-2)!==255||input.at(-1)!==217)return invalid();
 const chunks:Uint8Array[]=[input.slice(0,2)];let offset=2,width=0,height=0,scan=false;
 while(offset<input.length-2){
  const start=offset;
  if(input[offset++]!==255)return invalid();
  while(input[offset]===255)offset++;
  const marker=input[offset++];
  if(marker===undefined||marker===0||marker===216||marker===217||marker===1||(marker>=208&&marker<=215))return invalid();
  const size=(input[offset]<<8)|input[offset+1];
  if(size<2||offset+size>input.length-2)return invalid();
  if(marker>=192&&marker<=207&&![196,200,204].includes(marker)&&marker!==192)return invalid();
  if(marker===192){
   if(size<8||input[offset+2]!==8)return invalid();height=(input[offset+3]<<8)|input[offset+4];width=(input[offset+5]<<8)|input[offset+6];
  }
  if(marker===218){
   if(!width||!height||offset+size>=input.length-2)return invalid();
   for(let p=offset+size;p<input.length-2;p++){
    if(input[p]!==255)continue;
    while(input[p+1]===255)p++;
    const next=input[++p];
    if(next!==0&&!(next>=208&&next<=215))return invalid();
   }
   chunks.push(input.slice(start));scan=true;break;
  }
  if(!(marker>=224&&marker<=239)&&marker!==254)chunks.push(input.slice(start,offset+size));
  offset+=size;
 }
 if(!scan||width>6000||height>6000||width*height>20_000_000)return invalid();
 const bytes=new Uint8Array(chunks.reduce((sum,chunk)=>sum+chunk.length,0));let cursor=0;
 for(const chunk of chunks){bytes.set(chunk,cursor);cursor+=chunk.length;}
 return {bytes,width,height};
}
