CREATE TABLE submission_agreements (
 id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('registration','post','offer')),
 resource_id TEXT NOT NULL,
 version TEXT NOT NULL,
 document_json TEXT NOT NULL,
 submission_json TEXT NOT NULL,
 signature TEXT NOT NULL,
 signed_at TEXT NOT NULL,
 UNIQUE(purpose,resource_id)
);
CREATE INDEX submission_agreements_member ON submission_agreements(member_id,signed_at);
CREATE TRIGGER submission_agreements_no_update BEFORE UPDATE ON submission_agreements
 BEGIN SELECT RAISE(ABORT,'Signed submissions are immutable'); END;
CREATE TRIGGER submission_agreements_no_delete BEFORE DELETE ON submission_agreements
 BEGIN SELECT RAISE(ABORT,'Signed submissions are immutable'); END;
