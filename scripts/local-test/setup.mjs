import { readFileSync,writeFileSync,mkdirSync,existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes,createHash } from 'node:crypto';
import { passwordRecord,verifyPassword,LOCAL_DATABASE_ID,LOCAL_STATE_PATH } from './auth.mjs';

export const fixtureAccounts=[
 {key:'superadmin',id:'local-superadmin',platformId:'local-test-superadmin',name:'Demo Super Admin',email:'superadmin@velx.test',role:'Super Admin'},
 {key:'admin',id:'local-admin',platformId:'local-test-admin',name:'Demo Admin',email:'admin@velx.test',role:'Admin'},
 {key:'coach',id:'local-coach',platformId:'local-test-coach',name:'Demo Coach',email:'coach@velx.test',role:'Coach'},
 {key:'parent',id:'local-parent',platformId:'local-test-parent',name:'Demo Parent',email:'parent@velx.test',role:'Parent'},
 {key:'student',id:'local-student',platformId:'local-test-student',name:'Aarav Demo',email:'student@velx.test',role:'Student'},
];

export function prepareLocalTest() {
 const root=process.cwd();if(!existsSync(resolve(root,'lib/academy.ts')))throw new Error('Run this command from the VELX application directory.');
 const dir=resolve(root,'.sites-runtime/local-test');mkdirSync(dir,{recursive:true});
 const config=resolve(dir,'wrangler.json');writeFileSync(config,JSON.stringify({name:'velx-local-test',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'velx-local-test-d1',database_id:LOCAL_DATABASE_ID,migrations_dir:resolve(root,'drizzle')}],r2_buckets:[{binding:'BUCKET',bucket_name:'velx-local-test-files'}]},null,2));
 const credentialPath=resolve(dir,'credentials.json'),accountPath=resolve(dir,'accounts.json');
 let credentials;
 if(existsSync(credentialPath)&&existsSync(accountPath)){
  credentials=JSON.parse(readFileSync(credentialPath,'utf8'));
  const storedAccounts=JSON.parse(readFileSync(accountPath,'utf8'));
  for(const entry of credentials.accounts){const account=storedAccounts.find(a=>a.email===entry.email);entry.passwordChanged=!account||!verifyPassword(credentials.password,account);}
  writeFileSync(credentialPath,JSON.stringify(credentials,null,2),{mode:0o600});
 }
 else {
  const password=`VelxTest!${randomBytes(6).toString('hex')}`;
  const accounts=fixtureAccounts.map(a=>({...a,...passwordRecord(password)}));
  writeFileSync(accountPath,JSON.stringify(accounts,null,2),{mode:0o600});credentials={password,accounts:fixtureAccounts.map(({email,role,key})=>({email,role,key}))};
  writeFileSync(credentialPath,JSON.stringify(credentials,null,2),{mode:0o600});
 }
 const run=args=>{if(!args.includes('--local'))throw new Error('This helper must only use local D1.');const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js',...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:process.env});if(result.status!==0){process.stderr.write(result.stdout??'');process.stderr.write(result.stderr??'');throw new Error('Local database setup failed.');}console.log(args[1]==='migrations'?'Local test migrations are up to date.':'Fictional local academy records are ready.');};
 const dbArgs=['DB','--local','--config',config,'--persist-to',LOCAL_STATE_PATH];
 run(['d1','migrations','apply',...dbArgs]);
 const statements=[readFileSync('seed/reference.sql','utf8')];
 const literal=v=>v==null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
 const insert=(table,row)=>{const keys={parent_student_links:['parent_id','student_id'],batch_enrollments:['student_id','batch_id'],student_private:['student_id'],attendance:['student_id','batch_id','date']}[table]??['id'];statements.push(`INSERT OR IGNORE INTO ${table}(${Object.keys(row).join(',')}) SELECT ${Object.values(row).map(literal).join(',')} WHERE NOT EXISTS(SELECT 1 FROM ${table} WHERE ${keys.map(k=>`${k}=${literal(row[k])}`).join(' AND ')});`);};
 const date=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'});
 const offset=n=>new Date(new Date(date+'T12:00:00Z').getTime()+n*86400000).toISOString().slice(0,10);
 fixtureAccounts.forEach(a=>insert('users',{id:a.id,platform_id:a.platformId,email:a.email,name:a.name,role:a.role}));
 insert('coaches',{id:'local-coach-record',user_id:'local-coach',name:'Demo Coach',phone:'9000000001',bio:'Fictional coach for local testing.',published:0});
 insert('coaches',{id:'local-other-coach',name:'Other Demo Coach',phone:'9000000002',bio:'Fictional unrelated coach.',published:0});
 for(const [months,amount] of [[1,250000],[3,700000],[6,1300000],[12,2400000]])insert('fee_plans',{id:`local-plan-${months}`,name:`Demo ${months}-month plan`,months,amount});
 insert('batches',{id:'local-batch-juniors',name:'Demo Juniors - Taekwondo',programme_id:'taekwondo',coach_id:'local-coach-record',days:JSON.stringify(['Mon','Wed','Fri']),start_time:'17:00',end_time:'18:00',capacity:20});
 insert('batches',{id:'local-batch-mma',name:'Demo Adults - MMA',programme_id:'mma',coach_id:'local-other-coach',days:JSON.stringify(['Tue','Thu','Sat']),start_time:'18:30',end_time:'19:30',capacity:15});
 insert('parents',{id:'local-parent-record',user_id:'local-parent',name:'Demo Parent',phone:'9000000003',email:'parent@velx.test'});
 insert('parents',{id:'local-unrelated-parent',name:'Other Demo Parent',phone:'9000000004',email:'other-parent@velx.test'});
 const kids=[['local-child-aarav','Aarav Demo','2015-03-04','taekwondo','local-batch-juniors','local-parent-record','local-student','9000000003'],['local-child-ananya','Ananya Demo','2017-06-12','taekwondo','local-batch-juniors','local-parent-record',null,'9000000003'],['local-child-kabir','Kabir Demo','2004-02-20','mma','local-batch-mma','local-unrelated-parent',null,'9000000004']];
 kids.forEach(([id,name,dob,programme,batch,parent,user,phone],i)=>{
  insert('students',{id,admission_number:`LOCAL-DEMO-00${i+1}`,user_id:user,name,dob,phone,email:user?'student@velx.test':'',address:'Fictional local test address',programme_id:programme,joining_date:offset(-30),plan_id:'local-plan-1',belt_id:i===0?'yellow':'white',status:'Active'});
  insert('parent_student_links',{parent_id:parent,student_id:id});insert('batch_enrollments',{student_id:id,batch_id:batch});
  insert('student_private',{student_id:id,medical_notes:'LOCAL TEST: fictional medical note; administrators only.',emergency_contact:'LOCAL TEST CONTACT'});
  insert('invoices',{id:`local-invoice-${i+1}`,student_id:id,description:'LOCAL TEST - Monthly training',amount:250000,discount:i===0?25000:0,due_date:offset(i===0?-5:7)});
  for(let j=1;j<=4;j++)insert('attendance',{student_id:id,batch_id:batch,date:offset(-j*2),status:j===3?'Leave':'Present',marked_by:'local-coach'});
  insert('progress',{id:`local-progress-${i+1}`,student_id:id,coach_id:'local-coach',note:'LOCAL TEST: Showing improved balance, coordination and focus.'});
 });
 insert('payments',{id:'local-payment-1',invoice_id:'local-invoice-1',amount:100000,mode:'Cash',reference:'LOCAL TEST ONLY - simulated receipt',paid_at:offset(-8),confirmed_by:'local-superadmin',idempotency_key:'11111111-1111-4111-8111-000000000001'});
 insert('receipts',{id:'local-receipt-1',number:'LOCAL-DEMO-RECEIPT-001',payment_id:'local-payment-1'});
 insert('expenses',{id:'local-expense-1',category:'Demo equipment',description:'LOCAL TEST - fictional training pads',amount:50000,date:offset(-3),created_by:'local-superadmin'});
 ['New','Trial Scheduled','Follow-up'].forEach((status,i)=>insert('enquiries',{id:`local-enquiry-${i+1}`,code:`LOCAL-DEMO-ENQ-00${i+1}`,tracking_hash:createHash('sha256').update(`local-demo-key-${i}`).digest('hex'),name:`Demo Enquiry ${i+1}`,phone:'9000000005',age:10+i,programme_id:'taekwondo',preferred_batch:'Demo Juniors',location:'Local test area',message:'Fictional enquiry for CRM testing.',source:'Local test seed',status,assigned_to:'local-admin',followup_date:date}));
 insert('notifications',{id:'local-notification-1',title:'Local test environment is ready',body:'All records are fictional. Switch accounts to test role permissions.'});
 insert('announcements',{id:'local-announcement-1',title:'Welcome to the local test academy',body:'LOCAL TEST: Explore profiles, attendance, fee records and reports using the dummy accounts.',audience:'All',created_by:'local-superadmin'});
 insert('announcements',{id:'local-parent-notice',title:'Demo parent notice',body:'LOCAL TEST: This notice is visible to Parent accounts and administrators.',audience:'Parent',created_by:'local-superadmin'});
 insert('belt_exams',{id:'local-exam-1',name:'Demo Yellow Belt Grading',date:offset(14),belt_id:'yellow',fee:50000,eligibility:'LOCAL TEST: coach approval and regular attendance.'});
 insert('belt_results',{id:'local-result-1',exam_id:'local-exam-1',student_id:'local-child-aarav',result:'Registered',grade:'',certificate:''});
 insert('audit_logs',{id:'local-seed-audit',user_id:'local-superadmin',action:'local-test.seeded',entity_id:'local-test',detail:'Fictional local dataset, isolated from hosted DB.'});
 const seedFile=resolve(dir,'seed.sql');writeFileSync(seedFile,statements.join('\n'));run(['d1','execute',...dbArgs,'--file',seedFile]);
 return {credentials,dir};
}
