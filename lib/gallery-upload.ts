import {galleryLimits} from './gallery-policy';

export async function prepareGalleryUpload(file:File):Promise<Blob>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose JPEG, PNG or WebP photos.');
 if(file.size>galleryLimits.originalBytes)throw new Error('Choose original photos under 10 MB each.');
 let image:ImageBitmap;
 try{image=await createImageBitmap(file);}catch{throw new Error('This photo could not be opened. Choose another image.');}
 try{
  if(image.width*image.height>20_000_000)throw new Error('Choose photos of 20 megapixels or smaller.');
  const scale=Math.min(1,galleryLimits.longEdge/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('Photo processing is unavailable in this browser.');
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const encode=(quality:number)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Unable to prepare this photo.')),'image/jpeg',quality));
  let blob=await encode(.86);if(blob.size>galleryLimits.uploadBytes)blob=await encode(.7);
  if(blob.size>galleryLimits.uploadBytes)throw new Error('This photo is still too large. Choose a smaller image.');
  return blob;
 }finally{image.close();}
}
