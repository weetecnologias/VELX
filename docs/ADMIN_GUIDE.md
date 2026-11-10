# VELX academy administrator guide

## Public website navigation

The public menu scrolls to sections of the full homepage: About, Programmes,
Timetable, Coaches, Gallery, FAQs and Contact. The rest of the website stays
available by scrolling, and the mobile menu closes after a selection. Old links
such as `/about` redirect to `/#about`. Admission enquiries, enquiry tracking,
privacy and the academy portal retain their dedicated routes or controls.

## First use

Open `/portal` on the deployed site and sign in with the Site owner's authorised email. The bootstrap email is stored as the `BOOTSTRAP_ADMIN_EMAIL` secret in Sites. Only that authenticated identity can create the first Super Admin. Unknown accounts have no academy access.

1. Click **Set up academy** to initialise the programme and belt reference records. This does not create student records, schedules or prices.
2. Add verified coach records in **Coaches & parents**. Publish a biography only with the coach's agreement.
3. Create batches with programme, coach, days, times and capacity. Times are IST. You can edit a batch later. Capacity cannot be reduced below current enrolment.
4. Create the agreed monthly, three-month, six-month and annual fee plans in **Fees & payments**. Enter amounts in rupees; storage and raw exports use integer paise.
5. Admit students individually or import existing records. Confirm guardian permission and the academy's retention rules before collecting children's details.

## Enquiries and admission

Public enquiries require an adult or guardian contact consent and a valid Indian mobile number. They produce a unique enquiry ID, a private tracking key and an in-app admin notification. The tracking key is displayed once to the visitor; only its SHA-256 digest is stored. Source is captured from `utm_source`, referrer or Website. Automated email/WhatsApp messages are not sent.

Use **Follow up** to change stage, assign an administrator, set a date and add notes. Stages are New, Contacted, Trial Scheduled, Trial Attended, Follow-up, Converted and Lost. **Admit** pre-fills the known enquiry information. Enter the actual date of birth and guardian information, choose the batch and save. The admission and enquiry conversion are atomic. A converted enquiry cannot be converted again.

Use the WhatsApp icon to open a pre-filled draft. Review and send it yourself. It does not send automatically or mark a trial as booked.

## Students and Excel import

Student records include admission number, programme, batch, joining date, contact information, guardian, fee plan, belt and status. Medical/emergency notes are only returned by a separate administrator-only endpoint. Private photos are stored in R2 and served only after student access checks. Photos are never public.

For imports, upload the first worksheet of an `.xlsx` file or a `.csv` file under 3 MB, with a header row and at most **25 students per import**. Map columns, choose a batch and validate. Use ISO `YYYY-MM-DD` dates or real Excel date cells. Each import uses one batch/programme; split a mixed workbook by batch. Existing admission numbers are preserved; blank ones generate a unique VELX number. The preview detects invalid values, repeated admission numbers and matching name/DOB/mobile duplicates. No rows are written before final import. Commit repeats validation and saves the whole batch atomically; a failure saves none of it.

Edit a student to correct details, move batches or change Active/Inactive status. Existing admission numbers remain stable during edits. Inactive students remain in history but are excluded from marking new attendance.

## Coach, parent and student access

Only the Super Admin grants or revokes accounts in **Settings & access**. Grant the exact email the person uses for ChatGPT sign-in. This authorisation action does not send an invitation email. For Coach, Parent and Student roles, select the matching existing record. A role cannot be granted with an unrelated record type.

Coaches see only assigned batches and their students, attendance, progress and relevant announcements. They cannot access fees, exports, CRM, medical details, account administration or unrelated students. Parents see only linked children and their attendance, invoices and receipts. Student accounts see their own profile, attendance, timetable, progress, belt records and announcements. Add further children to an existing parent through **Coaches & parents → Link another child**, after confirming the guardian relationship. Revocation is checked on every subsequent API request.

Hosted authentication and sign-in sessions currently use the Sites identity provider. Local dummy accounts now have **Forgot password?**: enter the registered email, open the captured email in `/local-inbox`, follow the time-limited link and enter the new password twice. Sign in again afterwards; the role and linked children remain unchanged. Staff do not need to know or recover the password. The new password is never placed in the dummy credential listing. See `docs/PASSWORD_RECOVERY.md` for the local workflow and optional real email-service configuration. Independent production login/hosting remains a later task; the recovery adapter does not replace Sites sign-in by itself.

## Attendance

Choose the batch and date. Mark each active student Present, Absent or Leave, or use All present and adjust exceptions. Save only after all statuses are selected. The unique key is student + batch + date, so saving again updates the same attendance record. Future attendance is rejected. The history supports batch, student search and date filters. Coaches can mark only their assigned batches. Parents/students have read-only access.

## Fees and verified receipts

1. Create an invoice with student, description, fee, discount and due date. Plans are reference prices; invoices always capture the actual agreed amount.
2. Check actual cash received, UPI confirmation, bank statement or payment provider record outside the application.
3. Click **Record payment**, enter the amount, mode, date and transaction/cash reference, and affirm receipt verification.
4. Save. A payment and unique receipt are created together. Partial payments are supported. Repeated submission with the same payment key is idempotent; amounts exceeding the balance are rejected by both service validation and a database trigger.
5. Open **Print / save PDF**, then use the browser's print dialog and Save as PDF. This is a printable payment acknowledgement, not a tax invoice.

Confirmed payments and audit logs are immutable. There is currently no refund, credit-note, reversal or GST invoicing workflow. For an erroneous confirmed entry, retain the audit history and arrange an accountant-approved correction process; do not edit the database to erase evidence. No online gateway transaction is claimed to have succeeded by this app.

Fee reminder icons open a WhatsApp draft containing student name, balance and due date. Announcements also have a manual WhatsApp template. Review the destination and text before sending.

## Progress, examinations and reports

Coaches and administrators can add class/progress notes. Administrators schedule belt examinations, record eligibility rules and exam fees, register students and record results, grade and certificate reference. A Passed result updates the current belt; historical results remain available. Invoice and collect examination fees using the same verified financial workflow.

Reports include admissions/active status, enquiry conversion, attendance, fees, payment history, expenses and monthly income. Export CSV or Excel. Raw amounts are **paise** (divide by 100 for rupees); displayed amounts use INR. CSV exports neutralise spreadsheet formula prefixes. Reports show current saved records, not predictions. The workspace fetch limits the newest 2,000 enquiries, attendance events and follow-ups, 1,000 progress notes, 500 audit events and 100 notices. CSV and backup exports read all underlying records. For a larger academy, implement paginated report queries before relying on those dashboard counts.

## Backups and operations

Super Admins can download a JSON backup containing private database records. Keep encrypted, access-controlled copies, with a documented retention period. R2 photos require a separate storage backup; JSON contains only object keys. The JSON export is a sequential logical export, not a transactional point-in-time snapshot. Use the platform's native database backup/restore features for production recovery with concurrent writes.

`scripts/backup-to-sql.mjs` converts a trusted JSON backup into SQL for an empty database that already has these migrations applied. Never restore over live data. Restore and verify in a separate environment, and retain object keys when restoring the separate photo backup. Audit writes and export/restore activity should be reviewed regularly.

Before opening access to families, review your privacy notice, guardian consent process, actual timetable, coach biographies and agreed fees. The generated hero is conceptual imagery, labelled accordingly. No academy photographs, coach credentials, testimonials or performance claims were invented.
