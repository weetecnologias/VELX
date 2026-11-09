import { z } from 'zod';
import { enquirySchema, studentSchema, batchSchema, invoiceSchema, paymentSchema, roles, stages, day, csv } from './validation';

type Row = Record<string, any>;
export type Identity = { id:string; email:string; name:string };
type Options = { db:D1Database; identity:Identity|null; bootstrapEmail?:string; bucket?:R2Bucket };
class HttpError extends Error { constructor(public status:number, message:string) {super(message);} }
function fail(status:number,message:string):never {throw new HttpError(status,message);}
const uid=()=>crypto.randomUUID();
const code=(prefix:string)=>`${prefix}-${new Date().getFullYear()}-${uid().slice(0,8).toUpperCase()}`;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
export const isAdmin=(u:Row)=>['Super Admin','Admin'].includes(u.role);
const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(v=>v.toString(16).padStart(2,'0')).join('');

export async function academy(request:Request,options:Options):Promise<Response> {
 const {db,identity,bootstrapEmail,bucket}=options;
 const url=new URL(request.url), route=url.pathname.replace(/^\/api\/?/,'').replace(/\/$/,'');
 const q=(sql:string,...args:any[])=>db.prepare(sql).bind(...args);
 const all=async(sql:string,...args:any[])=> (await q(sql,...args).all<Row>()).results;
 const first=(sql:string,...args:any[])=>q(sql,...args).first<Row>();
 const audit=(user:Row|null,action:string,entity:string,detail='')=>q('INSERT INTO audit_logs(id,user_id,action,entity_id,detail) VALUES(?,?,?,?,?)',uid(),user?.id??null,action,entity,detail);
 const body=async()=>{const text=await request.text();if(text.length>250000)fail(413,'Request is too large');try{return JSON.parse(text);}catch{fail(400,'Invalid JSON request');}};
 const throttle=async(key:string,limit:number)=>{const now=Date.now(),window=Math.floor(now/600000);const k=await hash(`${key}:${window}`);const row=await q('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',k,now+1200000).first<Row>();if((row?.count??0)>limit)fail(429,'Too many requests. Please try again in 10 minutes.');await q('DELETE FROM rate_limits WHERE expires < ?',now).run();};
 try {
  if(!['GET','POST','PATCH'].includes(request.method))fail(405,'Method not allowed');
  if(request.method!=='GET'){
   const origin=request.headers.get('origin');
   if(origin && origin!==url.origin)fail(403,'Cross-origin requests are not accepted');
   if(request.headers.get('sec-fetch-site')==='cross-site')fail(403,'Cross-site requests are not accepted');
   if(!request.headers.get('content-type')?.includes('application/json'))fail(415,'Send application/json');
  }
  if(route==='public' && request.method==='GET')return json({
   programmes:await all('SELECT * FROM programmes WHERE active=1'),
   batches:await all('SELECT b.id,b.name,b.days,b.start_time,b.end_time,b.capacity,p.name programme,c.name coach FROM batches b JOIN programmes p ON p.id=b.programme_id LEFT JOIN coaches c ON c.id=b.coach_id WHERE b.active=1'),
   coaches:await all('SELECT id,name,bio FROM coaches WHERE published=1'),
  });
  if(route==='enquiries' && request.method==='POST'){
   await throttle(`enquiry:${request.headers.get('cf-connecting-ip')??'local'}`,5);
   const v=enquirySchema.parse(await body());if(v.website)fail(400,'Unable to submit enquiry');
   const token=uid()+uid(),id=uid(),trackingHash=await hash(token),enquiryCode=code('ENQ');
   await db.batch([
    q('INSERT INTO enquiries(id,code,tracking_hash,name,phone,age,programme_id,preferred_batch,location,message,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,enquiryCode,trackingHash,v.name,v.phone,v.age,v.programme_id||null,v.preferred_batch,v.location,v.message,v.source||'Website'),
    q('INSERT INTO notifications(id,title,body) VALUES(?,?,?)',uid(),'New admission enquiry',`${enquiryCode} is ready for follow-up.`),audit(null,'enquiry.created',id,'Website admission enquiry')
   ]);return json({code:enquiryCode,token},201);
  }
  if(route==='track' && request.method==='POST'){
   await throttle(`track:${request.headers.get('cf-connecting-ip')??'local'}`,15);
   const v=z.object({code:z.string().max(60),token:z.string().min(20).max(100)}).parse(await body());
   const row=await first('SELECT code,status,followup_date,created_at FROM enquiries WHERE code=? AND tracking_hash=?',v.code,await hash(v.token));
   if(!row)fail(404,'Enquiry not found. Check your enquiry ID and tracking key.');return json(row);
  }
  if(!identity)fail(401,'Sign in to access the academy portal');
  let user=await first('SELECT * FROM users WHERE platform_id=? AND active=1',identity!.id);
  if(!user){
   const email=identity!.email.toLowerCase();
   const invited=await first('SELECT * FROM users WHERE email=? AND active=1 AND platform_id IS NULL',email);
   if(invited){await q('UPDATE users SET platform_id=? WHERE id=? AND platform_id IS NULL',identity!.id,invited.id).run();user=await first('SELECT * FROM users WHERE platform_id=? AND active=1',identity!.id);}
   else if(bootstrapEmail && email===bootstrapEmail.toLowerCase()){
    const id=uid();await q("INSERT INTO users(id,platform_id,email,name,role) SELECT ?,?,?,?,'Super Admin' WHERE NOT EXISTS(SELECT 1 FROM users WHERE role='Super Admin')",id,identity!.id,email,identity!.name).run();
    user=await first('SELECT * FROM users WHERE platform_id=? AND active=1',identity!.id);
    if(user)await audit(user,'account.bootstrap',id).run();
   }
  }
  if(!user)fail(403,'Your account has no academy access. Ask an academy administrator to add your sign-in email.');
  const u=user!;
  const admin=()=>{if(!isAdmin(u))fail(403,'Administrator access required');};
  const superAdmin=()=>{if(u.role!=='Super Admin')fail(403,'Super Admin access required');};
  // Every student-derived query uses the same server-side ownership/assignment scope.
  const scope=(alias='s'):{sql:string,args:any[]}=>{
   if(isAdmin(u))return {sql:'1=1',args:[]};
   if(u.role==='Student')return {sql:`${alias}.user_id=?`,args:[u.id]};
   if(u.role==='Parent')return {sql:`EXISTS(SELECT 1 FROM parent_student_links l JOIN parents p ON p.id=l.parent_id WHERE l.student_id=${alias}.id AND p.user_id=?)`,args:[u.id]};
   return {sql:`EXISTS(SELECT 1 FROM batch_enrollments be JOIN batches b ON b.id=be.batch_id JOIN coaches c ON c.id=b.coach_id WHERE be.student_id=${alias}.id AND c.user_id=?)`,args:[u.id]};
  };
  const permitted=async(id:string)=>{const s=scope();if(!await first(`SELECT s.id FROM students s WHERE s.id=? AND ${s.sql}`,id,...s.args))fail(403,'Student is outside your access');};
  if(route==='me')return json({id:u.id,name:u.name,email:u.email,role:u.role});
  if(route==='data' && request.method==='GET'){
   const s=scope();
   const students=await all(`SELECT s.*,p.name programme,bl.name belt,be.batch_id,b.name batch,c.name coach,pa.name parent_name,pa.email parent_email FROM students s JOIN programmes p ON p.id=s.programme_id LEFT JOIN belt_levels bl ON bl.id=s.belt_id LEFT JOIN batch_enrollments be ON be.student_id=s.id LEFT JOIN batches b ON b.id=be.batch_id LEFT JOIN coaches c ON c.id=b.coach_id LEFT JOIN parent_student_links l ON l.student_id=s.id LEFT JOIN parents pa ON pa.id=l.parent_id WHERE ${s.sql} GROUP BY s.id,be.batch_id ORDER BY s.created_at DESC`,...s.args);
   const batchWhere=isAdmin(u)?{sql:'1=1',args:[]}:u.role==='Coach'?{sql:'c.user_id=?',args:[u.id]}:{sql:`EXISTS(SELECT 1 FROM batch_enrollments be JOIN students s ON s.id=be.student_id WHERE be.batch_id=b.id AND ${s.sql})`,args:s.args};
   const batches=await all(`SELECT b.*,p.name programme,c.name coach,(SELECT COUNT(*) FROM batch_enrollments be WHERE be.batch_id=b.id) enrolled FROM batches b JOIN programmes p ON p.id=b.programme_id LEFT JOIN coaches c ON c.id=b.coach_id WHERE ${batchWhere.sql}`, ...batchWhere.args);
   const attend=await all(`SELECT a.*,s.name student_name FROM attendance a JOIN students s ON s.id=a.student_id WHERE ${s.sql} ORDER BY a.date DESC LIMIT 2000`,...s.args);
   const financial=isAdmin(u)||u.role==='Parent';
   const invoices=financial?await all(`SELECT i.*,s.name student_name,s.phone,COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) received FROM invoices i JOIN students s ON s.id=i.student_id WHERE ${s.sql} ORDER BY i.due_date`,...s.args):[];
   const payments=financial?await all(`SELECT p.*,r.number receipt_number,r.id receipt_id,s.name student_name FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN students s ON s.id=i.student_id LEFT JOIN receipts r ON r.payment_id=p.id WHERE ${s.sql} ORDER BY p.created_at DESC`,...s.args):[];
   const result:Row={user:{id:u.id,name:u.name,email:u.email,role:u.role},students,batches,attendance:attend,invoices,payments,programmes:await all('SELECT * FROM programmes'),announcements:await all('SELECT * FROM announcements WHERE audience IN (?,?) ORDER BY created_at DESC LIMIT 100','All',u.role),progress:await all(`SELECT p.*,s.name student_name FROM progress p JOIN students s ON s.id=p.student_id WHERE ${s.sql} ORDER BY p.created_at DESC LIMIT 1000`,...s.args),belt_levels:await all('SELECT * FROM belt_levels ORDER BY rank'),belt_results:await all(`SELECT r.*,e.name exam,e.date FROM belt_results r JOIN belt_exams e ON e.id=r.exam_id JOIN students s ON s.id=r.student_id WHERE ${s.sql}`,...s.args)};
   if(isAdmin(u))Object.assign(result,{
    enquiries:await all('SELECT e.*,p.name programme,u.name assigned_name FROM enquiries e LEFT JOIN programmes p ON p.id=e.programme_id LEFT JOIN users u ON u.id=e.assigned_to ORDER BY e.created_at DESC LIMIT 2000'),followups:await all('SELECT f.*,u.name staff_name FROM enquiry_followups f JOIN users u ON u.id=f.user_id ORDER BY f.created_at DESC LIMIT 2000'),coaches:await all('SELECT * FROM coaches'),parents:await all('SELECT * FROM parents'),fee_plans:await all('SELECT * FROM fee_plans'),expenses:await all('SELECT * FROM expenses ORDER BY date DESC LIMIT 2000'),notifications:await all('SELECT * FROM notifications WHERE user_id IS NULL OR user_id=? ORDER BY created_at DESC LIMIT 100',u.id),users:await all('SELECT id,name,email,role,active FROM users ORDER BY name'),belt_exams:await all('SELECT * FROM belt_exams ORDER BY date DESC'),audit_logs:u.role==='Super Admin'?await all('SELECT a.*,u.name user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 500'):[],settings:await all('SELECT * FROM settings')
   });
   // Financial and medical data are never sent to the coach payload.
   if(u.role==='Coach')for(const row of students){delete row.plan_id;delete row.address;delete row.parent_email;delete row.email;delete row.photo_key;}
   return json(result);
  }
  if(route==='setup' && request.method==='POST'){
   superAdmin();await db.batch([
    ...roles.map(r=>q('INSERT OR IGNORE INTO roles(name) VALUES(?)',r)),
    q("INSERT OR IGNORE INTO programmes(id,name,description,age_group) VALUES('taekwondo','Taekwondo','Technique, discipline and a clear path through the belts.','Children, teens & adults')"),
    q("INSERT OR IGNORE INTO programmes(id,name,description,age_group) VALUES('mma','Mixed Martial Arts','Build coordinated striking, movement and conditioning.','Teens & adults')"),
    q("INSERT OR IGNORE INTO programmes(id,name,description,age_group) VALUES('self-defence','Self Defence','Practical awareness, movement and confidence.','Adults')"),
    ...['White','Yellow','Green','Blue','Red','Black'].map((n,i)=>q('INSERT OR IGNORE INTO belt_levels(id,name,rank) VALUES(?,?,?)',n.toLowerCase(),n,i)),audit(u,'academy.initialized','academy')
   ]);return json({ok:true});
  }
  const admissionStatements=async(raw:unknown)=>{
   const v=studentSchema.parse(raw),id=uid(),parentId=uid(),admission=v.admission_number||code('VELX');
   const batch=await first('SELECT * FROM batches WHERE id=? AND active=1',v.batch_id);if(!batch || batch.programme_id!==v.programme_id)fail(400,'Choose an active batch for this programme');
   if(v.enquiry_id && !await first("SELECT id FROM enquiries WHERE id=? AND student_id IS NULL AND status!='Converted'",v.enquiry_id))fail(409,'This enquiry was already converted or is unavailable');
   const statements=[
    q('INSERT INTO students(id,admission_number,name,dob,phone,email,address,programme_id,joining_date,plan_id,belt_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,admission,v.name,v.dob,v.phone,v.email,v.address,v.programme_id,v.joining_date,v.plan_id||null,'white',v.status),
    q('INSERT INTO parents(id,name,phone,email) VALUES(?,?,?,?)',parentId,v.parent_name,v.phone,v.parent_email),q('INSERT INTO parent_student_links(parent_id,student_id) VALUES(?,?)',parentId,id),
    q('INSERT INTO batch_enrollments(student_id,batch_id) VALUES(?,?)',id,v.batch_id),q('INSERT INTO student_private(student_id,medical_notes,emergency_contact) VALUES(?,?,?)',id,v.medical_notes,v.emergency_contact),audit(u,'student.admitted',id,admission)
   ];
   if(v.enquiry_id)statements.push(q('INSERT INTO enquiry_conversions(enquiry_id,student_id) VALUES(?,?)',v.enquiry_id,id),q("UPDATE enquiries SET status='Converted',student_id=? WHERE id=? AND student_id IS NULL",id,v.enquiry_id));
   return {id,admission,statements};
  };
  if(route==='students' && request.method==='POST'){admin();const v=await admissionStatements(await body());await db.batch(v.statements);return json({id:v.id,admission_number:v.admission},201);}
  if(route==='students/status' && request.method==='POST'){admin();const v=z.object({id:z.string(),status:z.enum(['Active','Inactive'])}).parse(await body());await db.batch([q('UPDATE students SET status=? WHERE id=?',v.status,v.id),audit(u,'student.status',v.id,v.status)]);return json({ok:true});}
  if(route==='parent-links' && request.method==='POST'){
   admin();const v=z.object({parent_id:z.string(),student_id:z.string()}).parse(await body());await db.batch([q('INSERT OR IGNORE INTO parent_student_links(parent_id,student_id) VALUES(?,?)',v.parent_id,v.student_id),audit(u,'parent.child-linked',v.student_id)]);return json({ok:true});
  }
  if(route==='students/private' && request.method==='POST'){admin();const {id}=z.object({id:z.string()}).parse(await body());return json(await first('SELECT * FROM student_private WHERE student_id=?',id));}
  if(route==='students/update' && request.method==='POST'){
   admin();const raw=await body(),v=studentSchema.parse(raw),id=z.string().parse(raw.id);if(!await first('SELECT id FROM students WHERE id=?',id))fail(404,'Student not found');
   const b=await first('SELECT * FROM batches WHERE id=? AND active=1',v.batch_id);if(!b||b.programme_id!==v.programme_id)fail(400,'Programme and batch must match');
   await db.batch([q('UPDATE students SET name=?,dob=?,phone=?,email=?,address=?,programme_id=?,joining_date=?,plan_id=?,status=? WHERE id=?',v.name,v.dob,v.phone,v.email,v.address,v.programme_id,v.joining_date,v.plan_id||null,v.status,id),q('DELETE FROM batch_enrollments WHERE student_id=?',id),q('INSERT INTO batch_enrollments(student_id,batch_id) VALUES(?,?)',id,v.batch_id),q('UPDATE parents SET name=?,email=?,phone=? WHERE id IN(SELECT parent_id FROM parent_student_links WHERE student_id=?)',v.parent_name,v.parent_email,v.phone,id),q('UPDATE student_private SET medical_notes=?,emergency_contact=? WHERE student_id=?',v.medical_notes,v.emergency_contact,id),audit(u,'student.updated',id)]);return json({ok:true});
  }
  if(route==='import/preview'||route==='import/commit'){
   admin();const {rows}=z.object({rows:z.array(z.unknown()).min(1).max(25)}).parse(await body());
   const seen=new Set<string>(),validated:Row[]=[],errors:Row[]=[];
   for(let i=0;i<rows.length;i++){
    const parsed=studentSchema.safeParse(rows[i]);if(!parsed.success){errors.push({row:i+1,message:parsed.error.issues.map(e=>`${e.path.join('.')}: ${e.message}`).join('; ')});continue;}
    const v=parsed.data,key=v.admission_number||`${v.name.toLowerCase()}|${v.dob}|${v.phone}`;
    if(seen.has(key) || await first('SELECT id FROM students WHERE admission_number=? OR (lower(name)=? AND dob=? AND phone=?)',v.admission_number,v.name.toLowerCase(),v.dob,v.phone)){errors.push({row:i+1,message:'Duplicate admission number or matching name, date of birth and phone'});continue;}
    seen.add(key);const b=await first('SELECT programme_id FROM batches WHERE id=? AND active=1',v.batch_id);if(!b||b.programme_id!==v.programme_id){errors.push({row:i+1,message:'Batch is unavailable or belongs to another programme'});continue;}validated.push(v);
   }
   if(route==='import/preview')return json({valid:validated,errors,total:rows.length});
   if(errors.length)fail(400,errors.map(e=>`Row ${e.row}: ${e.message}`).join('\n'));
   const statements:D1PreparedStatement[]=[];for(const v of validated){if(v.enquiry_id)fail(400,'Enquiry conversion must use the CRM');statements.push(...(await admissionStatements(v)).statements);}await db.batch(statements);return json({imported:validated.length});
  }
  if(route==='crm' && request.method==='POST'){
   admin();const v=z.object({id:z.string(),status:z.enum(stages).exclude(['Converted']),followup_date:day.nullable().optional(),assigned_to:z.string().nullable().optional(),note:z.string().trim().max(2000).default('')}).parse(await body());
   const existing=await first('SELECT * FROM enquiries WHERE id=?',v.id);if(!existing)fail(404,'Enquiry not found');if(existing.status==='Converted')fail(409,'Converted enquiries cannot return to the pipeline');
   if(v.assigned_to&&!await first("SELECT id FROM users WHERE id=? AND active=1 AND role IN ('Super Admin','Admin')",v.assigned_to))fail(400,'Assign an active administrator');
   const statements=[q('UPDATE enquiries SET status=?,followup_date=?,assigned_to=? WHERE id=?',v.status,v.followup_date||null,v.assigned_to||null,v.id),audit(u,'enquiry.updated',v.id,v.status)];if(v.note)statements.push(q('INSERT INTO enquiry_followups(id,enquiry_id,user_id,note) VALUES(?,?,?,?)',uid(),v.id,u.id,v.note));await db.batch(statements);return json({ok:true});
  }
  if(route==='batches' && request.method==='POST'){admin();const v=batchSchema.parse(await body()),id=uid();await db.batch([q('INSERT INTO batches(id,name,programme_id,coach_id,days,start_time,end_time,capacity) VALUES(?,?,?,?,?,?,?,?)',id,v.name,v.programme_id,v.coach_id||null,JSON.stringify([...new Set(v.days)]),v.start_time,v.end_time,v.capacity),audit(u,'batch.created',id)]);return json({id},201);}
  if(route==='batches/update' && request.method==='POST'){
   admin();const raw=await body(),v=batchSchema.parse(raw),id=z.string().parse(raw.id);const existing=await first('SELECT * FROM batches WHERE id=?',id);if(!existing)fail(404,'Batch not found');const count=await first('SELECT COUNT(*) n FROM batch_enrollments WHERE batch_id=?',id);if((count?.n??0)>v.capacity)fail(400,'Capacity cannot be lower than the enrolled student count');if((count?.n??0)>0&&existing.programme_id!==v.programme_id)fail(400,'Move enrolled students before changing the programme');await db.batch([q('UPDATE batches SET name=?,programme_id=?,coach_id=?,days=?,start_time=?,end_time=?,capacity=? WHERE id=?',v.name,v.programme_id,v.coach_id||null,JSON.stringify([...new Set(v.days)]),v.start_time,v.end_time,v.capacity,id),audit(u,'batch.updated',id)]);return json({ok:true});
  }
  if(route==='attendance' && request.method==='POST'){
   if(!isAdmin(u)&&u.role!=='Coach')fail(403,'Coach or administrator access required');
   const v=z.object({batch_id:z.string(),date:day.refine(v=>v<=new Date().toISOString().slice(0,10),'Cannot mark future attendance'),records:z.array(z.object({student_id:z.string(),status:z.enum(['Present','Absent','Leave'])})).min(1).max(500)}).parse(await body());
   if(!isAdmin(u)&&!await first('SELECT b.id FROM batches b JOIN coaches c ON c.id=b.coach_id WHERE b.id=? AND c.user_id=?',v.batch_id,u.id))fail(403,'Batch is not assigned to you');
   const statements:D1PreparedStatement[]=[];for(const r of v.records){if(!await first("SELECT s.id FROM students s JOIN batch_enrollments be ON be.student_id=s.id WHERE s.id=? AND be.batch_id=? AND s.status='Active'",r.student_id,v.batch_id))fail(400,'A student is not active in this batch');statements.push(q("INSERT INTO attendance(student_id,batch_id,date,status,marked_by) VALUES(?,?,?,?,?) ON CONFLICT(student_id,batch_id,date) DO UPDATE SET status=excluded.status,marked_by=excluded.marked_by,created_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",r.student_id,v.batch_id,v.date,r.status,u.id));}
   statements.push(audit(u,'attendance.saved',v.batch_id,`${v.date}: ${v.records.length} students`));await db.batch(statements);return json({saved:v.records.length});
  }
  if(route==='invoices' && request.method==='POST'){admin();const v=invoiceSchema.parse(await body()),id=uid();await db.batch([q('INSERT INTO invoices(id,student_id,description,amount,discount,due_date) VALUES(?,?,?,?,?,?)',id,v.student_id,v.description,v.amount,v.discount,v.due_date),audit(u,'invoice.created',id)]);return json({id},201);}
  if(route==='payments' && request.method==='POST'){
   admin();const v=paymentSchema.parse(await body());
   const previous=await first('SELECT * FROM payments WHERE idempotency_key=?',v.idempotency_key);if(previous){if(previous.invoice_id!==v.invoice_id||previous.amount!==v.amount)fail(409,'Payment key was already used for another payment');return json({id:previous.id,duplicate:true});}
   const invoice=await first('SELECT i.*,COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) received FROM invoices i WHERE id=?',v.invoice_id);if(!invoice)fail(404,'Invoice not found');if(v.amount>invoice.amount-invoice.discount-invoice.received)fail(400,'Payment exceeds the outstanding balance');
   const id=uid(),receipt=code('VELX-R');await db.batch([
    q('INSERT INTO payments(id,invoice_id,amount,mode,reference,paid_at,confirmed_by,idempotency_key) VALUES(?,?,?,?,?,?,?,?)',id,v.invoice_id,v.amount,v.mode,v.reference,v.paid_at,u.id,v.idempotency_key),q('INSERT INTO receipts(id,number,payment_id) VALUES(?,?,?)',uid(),receipt,id),audit(u,'payment.confirmed',id,`${v.mode}; manual verification recorded`)
   ]);return json({id,receipt},201);
  }
  if(route==='receipt' && request.method==='GET'){
   if(!isAdmin(u)&&u.role!=='Parent')fail(403,'Receipt access is restricted');const s=scope();const row=await first(`SELECT r.number,p.amount,p.mode,p.reference,p.paid_at,i.description,s.name,s.admission_number FROM receipts r JOIN payments p ON p.id=r.payment_id JOIN invoices i ON i.id=p.invoice_id JOIN students s ON s.id=i.student_id WHERE r.id=? AND ${s.sql}`,url.searchParams.get('id'),...s.args);if(!row)fail(404,'Receipt not found');return json(row);
  }
  if(route==='fee-plans' && request.method==='POST'){admin();const v=z.object({name:z.string().trim().min(2).max(100),months:z.coerce.number().refine(v=>[1,3,6,12].includes(v)),amount:z.coerce.number().int().nonnegative()}).parse(await body());const id=uid();await db.batch([q('INSERT INTO fee_plans(id,name,months,amount) VALUES(?,?,?,?)',id,v.name,v.months,v.amount),audit(u,'fee-plan.created',id)]);return json({id});}
  if(route==='coaches' && request.method==='POST'){admin();const v=z.object({name:z.string().trim().min(2).max(100),phone:z.string().max(20).default(''),bio:z.string().max(1500).default(''),published:z.boolean().default(false),user_id:z.string().nullable().optional()}).parse(await body());const id=uid();await db.batch([q('INSERT INTO coaches(id,name,phone,bio,published,user_id) VALUES(?,?,?,?,?,?)',id,v.name,v.phone,v.bio,v.published?1:0,v.user_id||null),audit(u,'coach.created',id)]);return json({id});}
  if(route==='users' && request.method==='POST'){
   superAdmin();const v=z.object({email:z.string().email().transform(v=>v.toLowerCase()),name:z.string().trim().min(2).max(100),role:z.enum(roles).exclude(['Super Admin']),linked_id:z.string().optional()}).parse(await body());const id=uid(),statements=[q('INSERT INTO users(id,email,name,role) VALUES(?,?,?,?)',id,v.email,v.name,v.role),audit(u,'account.granted',id,v.role)];
   if(['Coach','Parent','Student'].includes(v.role)){if(!v.linked_id)fail(400,'Select the matching coach, parent or student record');const table={Coach:'coaches',Parent:'parents',Student:'students'}[v.role as 'Coach'|'Parent'|'Student'];const record=await first(`SELECT id,user_id FROM ${table} WHERE id=?`,v.linked_id);if(!record||record.user_id)fail(400,'Record is unavailable or already linked');statements.push(q(`UPDATE ${table} SET user_id=? WHERE id=?`,id,v.linked_id));}await db.batch(statements);return json({id});
  }
  if(route==='users/revoke' && request.method==='POST'){superAdmin();const {id}=z.object({id:z.string()}).parse(await body());if(id===u.id)fail(400,'You cannot revoke your own account');await db.batch([q("UPDATE users SET active=0 WHERE id=? AND role!='Super Admin'",id),audit(u,'account.revoked',id)]);return json({ok:true});}
  if(route==='announcements' && request.method==='POST'){admin();const v=z.object({title:z.string().trim().min(2).max(100),body:z.string().trim().min(2).max(3000),audience:z.enum(['All',...roles])}).parse(await body());const id=uid();await db.batch([q('INSERT INTO announcements(id,title,body,audience,created_by) VALUES(?,?,?,?,?)',id,v.title,v.body,v.audience,u.id),audit(u,'announcement.created',id)]);return json({id});}
  if(route==='expenses' && request.method==='POST'){admin();const v=z.object({category:z.string().min(2).max(100),description:z.string().min(2).max(300),amount:z.coerce.number().int().positive(),date:day}).parse(await body());const id=uid();await db.batch([q('INSERT INTO expenses(id,category,description,amount,date,created_by) VALUES(?,?,?,?,?,?)',id,v.category,v.description,v.amount,v.date,u.id),audit(u,'expense.created',id)]);return json({id});}
  if(route==='progress' && request.method==='POST'){if(!isAdmin(u)&&u.role!=='Coach')fail(403,'Coach access required');const v=z.object({student_id:z.string(),note:z.string().trim().min(2).max(2000)}).parse(await body());await permitted(v.student_id);await db.batch([q('INSERT INTO progress(id,student_id,coach_id,note) VALUES(?,?,?,?)',uid(),v.student_id,u.id,v.note),audit(u,'progress.recorded',v.student_id)]);return json({ok:true});}
  if(route==='belt-exams' && request.method==='POST'){admin();const v=z.object({name:z.string().min(2).max(100),date:day,belt_id:z.string(),fee:z.coerce.number().int().nonnegative(),eligibility:z.string().min(2).max(1000)}).parse(await body());const id=uid();await db.batch([q('INSERT INTO belt_exams(id,name,date,belt_id,fee,eligibility) VALUES(?,?,?,?,?,?)',id,v.name,v.date,v.belt_id,v.fee,v.eligibility),audit(u,'belt-exam.created',id)]);return json({id});}
  if(route==='belt-results' && request.method==='POST'){admin();const v=z.object({exam_id:z.string(),student_id:z.string(),result:z.enum(['Registered','Passed','Not passed']),grade:z.string().max(50).default(''),certificate:z.string().max(200).default('')}).parse(await body());const exam=await first('SELECT * FROM belt_exams WHERE id=?',v.exam_id);if(!exam)fail(404,'Exam not found');const statements=[q('INSERT INTO belt_results(id,exam_id,student_id,result,grade,certificate) VALUES(?,?,?,?,?,?) ON CONFLICT(exam_id,student_id) DO UPDATE SET result=excluded.result,grade=excluded.grade,certificate=excluded.certificate',uid(),v.exam_id,v.student_id,v.result,v.grade,v.certificate),audit(u,'belt-result.saved',v.student_id,v.result)];if(v.result==='Passed')statements.push(q('UPDATE students SET belt_id=? WHERE id=?',exam.belt_id,v.student_id));await db.batch(statements);return json({ok:true});}
  if(route==='notifications/read' && request.method==='POST'){admin();await q('UPDATE notifications SET read=1 WHERE user_id IS NULL OR user_id=?',u.id).run();return json({ok:true});}
  if(route==='settings' && request.method==='POST'){superAdmin();const v=z.object({name:z.string().max(150),contact:z.string().max(20),address:z.string().max(500)}).parse(await body());await db.batch([...Object.entries(v).map(([k,v])=>q('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',k,v)),audit(u,'settings.updated','academy')]);return json({ok:true});}
  if(route==='export' && request.method==='GET'){
   admin();const table=url.searchParams.get('type')??'students';
   const queries:Record<string,string>={students:'SELECT admission_number,name,dob,phone,email,address,joining_date,status FROM students',enquiries:'SELECT code,name,phone,age,source,status,followup_date,created_at FROM enquiries',attendance:'SELECT a.date,s.admission_number,s.name,b.name batch,a.status FROM attendance a JOIN students s ON s.id=a.student_id JOIN batches b ON b.id=a.batch_id',fees:'SELECT i.id,s.name,i.description,i.amount,i.discount,i.due_date,COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) received FROM invoices i JOIN students s ON s.id=i.student_id',payments:'SELECT p.paid_at,s.name,p.amount,p.mode,p.reference,r.number receipt FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN students s ON s.id=i.student_id JOIN receipts r ON r.payment_id=p.id',expenses:'SELECT category,description,amount,date FROM expenses'};
   if(!queries[table])fail(400,'Unknown report');await audit(u,'report.exported',table).run();return new Response('\uFEFF'+csv(await all(queries[table])),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="velx-${table}.csv"`,'Cache-Control':'no-store'}});
  }
  if(route==='backup' && request.method==='GET'){
   superAdmin();const names=['users','profiles','programmes','coaches','parents','fee_plans','batches','belt_levels','students','student_private','parent_student_links','batch_enrollments','enquiries','enquiry_conversions','enquiry_followups','attendance','invoices','payments','receipts','expenses','belt_exams','belt_results','progress','announcements','notifications','settings','audit_logs'];const backup:Row={version:1,exported_at:new Date().toISOString(),currency:'INR',amount_unit:'paise'};for(const name of names)backup[name]=await all(`SELECT * FROM ${name}`);await audit(u,'backup.exported','academy').run();return new Response(JSON.stringify(backup,null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="velx-backup.json"','Cache-Control':'no-store'}});
  }
  if(route==='photo' && request.method==='GET'){
   const id=url.searchParams.get('id')??'';await permitted(id);const s=await first('SELECT photo_key FROM students WHERE id=?',id);if(!s?.photo_key||!bucket)fail(404,'Photo not found');const object=await bucket!.get(s!.photo_key);if(!object)fail(404,'Photo not found');return new Response(object!.body,{headers:{'Content-Type':object!.httpMetadata?.contentType??'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(route==='photo' && request.method==='POST'){
   admin();if(!bucket)fail(503,'Private file storage is not configured');const v=z.object({student_id:z.string(),data:z.string().max(2000000),type:z.enum(['image/jpeg','image/png','image/webp'])}).parse(await body());await permitted(v.student_id);let bytes:Uint8Array;try{bytes=Uint8Array.from(atob(v.data),c=>c.charCodeAt(0));}catch{fail(400,'Invalid image encoding');}
   const b=bytes!;const valid=v.type==='image/jpeg'?b[0]===255&&b[1]===216:v.type==='image/png'?b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71:b[0]===82&&b[1]===73&&b[8]===87&&b[9]===69;if(!valid)fail(400,'Image content does not match the selected file type');
   const key=`students/${v.student_id}/${uid()}`;await bucket!.put(key,b,{httpMetadata:{contentType:v.type}});await db.batch([q('UPDATE students SET photo_key=? WHERE id=?',key,v.student_id),audit(u,'student.photo',v.student_id)]);return json({ok:true});
  }
  fail(404,'Endpoint not found');
 }catch(error){
  if(error instanceof HttpError)return json({error:error.message},error.status);
  if(error instanceof z.ZodError)return json({error:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')},400);
  const message=error instanceof Error?error.message:String(error);
  if(/UNIQUE constraint|already converted|capacity|overpayment|programme mismatch/i.test(message))return json({error:'This record conflicts with existing data, the batch is full, or the payment exceeds its balance.'},409);
  if(/FOREIGN KEY|CHECK constraint/i.test(message))return json({error:'A linked record or field value is invalid. Refresh the page and check your selections.'},400);
  console.error('Academy request failed',{route,message});return json({error:'Unable to complete this request. Please retry or contact the academy administrator.'},500);
 }
 return json({error:'Endpoint not found'},404);
}


