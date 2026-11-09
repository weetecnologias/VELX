CREATE TRIGGER payment_balance_guard BEFORE INSERT ON payments
BEGIN
 SELECT CASE WHEN NEW.amount > (SELECT amount-discount-COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=NEW.invoice_id),0) FROM invoices WHERE id=NEW.invoice_id) THEN RAISE(ABORT,'overpayment') END;
END;
--> statement-breakpoint
CREATE TRIGGER payment_immutable_update BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT,'confirmed payments are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER payment_immutable_delete BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT,'confirmed payments are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_immutable_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT,'audit logs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER audit_immutable_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT,'audit logs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER enrollment_capacity BEFORE INSERT ON batch_enrollments
BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM batch_enrollments WHERE batch_id=NEW.batch_id)>=(SELECT capacity FROM batches WHERE id=NEW.batch_id) THEN RAISE(ABORT,'batch capacity exceeded') END;
 SELECT CASE WHEN (SELECT programme_id FROM students WHERE id=NEW.student_id)!=(SELECT programme_id FROM batches WHERE id=NEW.batch_id) THEN RAISE(ABORT,'programme mismatch') END;
END;
