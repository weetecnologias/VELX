import {readFileSync,writeFileSync} from 'node:fs';
const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/backup-to-sql.mjs trusted-backup.json restore-into-empty-database.sql');
const data=JSON.parse(readFileSync(input,'utf8'));if(data.version!==1)throw Error('Unsupported backup version');
const tables=['users','profiles','programmes','coaches','parents','fee_plans','belt_levels','batches','students','student_private','parent_student_links','batch_enrollments','enquiries','enquiry_conversions','enquiry_followups','attendance','invoices','payments','receipts','expenses','belt_exams','belt_results','progress','announcements','notifications','settings','audit_logs'];
const cell=v=>v===null?'NULL':typeof v==='number'&&Number.isFinite(v)?String(v):"'"+String(v).replaceAll("'","''")+"'";
const sql=['-- Restore only into a new empty database with matching migrations. Never overwrite live data.','PRAGMA foreign_keys=ON;'];
for(const name of tables)for(const row of data[name]??[]){const keys=Object.keys(row);if(keys.some(k=>!/^[a-z_]+$/.test(k)))throw Error('Invalid backup column');sql.push(`INSERT INTO "${name}" (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map(k=>cell(row[k])).join(',')});`);}
writeFileSync(output,sql.join('\n')+'\n',{flag:'wx'});console.log('Restore SQL created. Keep this sensitive file private.');

