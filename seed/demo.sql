-- FICTIONAL DATA. Apply only to an isolated test database after reference.sql.
-- No usable sign-in account, identity-provider ID or real contact data is seeded.
INSERT INTO coaches(id,name,phone,bio,published) VALUES ('demo-coach','Sample Coach (fictional)','','Example training profile for local testing.',0);
INSERT INTO fee_plans(id,name,months,amount) VALUES ('demo-plan','Sample monthly plan (fictional)',1,250000);
INSERT INTO batches(id,name,programme_id,coach_id,days,start_time,end_time,capacity) VALUES ('demo-batch','Sample evening batch (fictional)','taekwondo','demo-coach','["Mon","Wed","Fri"]','17:00','18:00',20);
INSERT INTO students(id,admission_number,name,dob,phone,email,address,programme_id,joining_date,plan_id,belt_id,status) VALUES ('demo-student','DEMO-001','Sample Student (fictional)','2015-01-01','0000000000','','Example location','taekwondo','2026-01-01','demo-plan','white','Active');
INSERT INTO parents(id,name,phone,email) VALUES ('demo-parent','Sample Guardian (fictional)','0000000000','');
INSERT INTO parent_student_links(parent_id,student_id) VALUES ('demo-parent','demo-student');
INSERT INTO batch_enrollments(student_id,batch_id) VALUES ('demo-student','demo-batch');
INSERT INTO student_private(student_id,medical_notes,emergency_contact) VALUES ('demo-student','','');
INSERT INTO invoices(id,student_id,description,amount,discount,due_date) VALUES ('demo-invoice','demo-student','Sample training invoice (fictional)',250000,0,'2026-01-10');
