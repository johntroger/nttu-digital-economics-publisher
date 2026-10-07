-- Environment identity is checked before any management data can be read.
DELETE FROM application_state WHERE environment!='production';
CREATE TABLE production_identity (
 id INTEGER PRIMARY KEY CHECK(id=1),
 environment TEXT NOT NULL CHECK(environment='production'),
 database_id TEXT NOT NULL,
 schema_version INTEGER NOT NULL CHECK(schema_version=1)
);
CREATE TRIGGER production_identity_immutable BEFORE UPDATE ON production_identity
 BEGIN SELECT RAISE(ABORT,'production identity is immutable'); END;
CREATE TRIGGER production_identity_preserved BEFORE DELETE ON production_identity
 BEGIN SELECT RAISE(ABORT,'production identity is preserved'); END;
CREATE TABLE production_control (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled=0),
 publish_time TEXT NOT NULL DEFAULT '10:00' CHECK(publish_time='10:00'),
 timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh' CHECK(timezone='Asia/Ho_Chi_Minh'),
 target_page_url TEXT NOT NULL,
 page_id TEXT,
 connection_verified INTEGER NOT NULL DEFAULT 0 CHECK(connection_verified=0)
);
INSERT INTO production_control(id,target_page_url) VALUES(1,'https://www.facebook.com/NganhKinhTeSoNTTU');
