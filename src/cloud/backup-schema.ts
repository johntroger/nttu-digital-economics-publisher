// Trusted schema/resource metadata; no snapshot contents.
export const BACKUP_SCHEMA = {
  "version": 13,
  "fingerprint": "7fb6648137d61729bf4e01267b6eddf613448e7b241d864aa760fbaf7c33d96d",
  "tables": [
    {
      "name": "actual_day_guards",
      "columns": [
        "page_connection_id",
        "business_date",
        "publication_id"
      ]
    },
    {
      "name": "application_state",
      "columns": [
        "environment",
        "paused_by_user",
        "operation_generation",
        "maintenance_owner",
        "blocked_reasons",
        "last_run_at",
        "last_progress_at",
        "maintenance_generation"
      ]
    },
    {
      "name": "asset_bindings",
      "columns": [
        "version_id",
        "asset_id",
        "check_version",
        "checksum"
      ]
    },
    {
      "name": "assets",
      "columns": [
        "id",
        "storage_key",
        "checksum",
        "content_type",
        "width",
        "height",
        "size_bytes",
        "status"
      ]
    },
    {
      "name": "attempts",
      "columns": [
        "id",
        "job_id",
        "ordinal",
        "intent_at",
        "outcome"
      ]
    },
    {
      "name": "cloud_caption_keys",
      "columns": [
        "checksum",
        "post_id",
        "version_id"
      ]
    },
    {
      "name": "cloud_library",
      "columns": [
        "id",
        "kind",
        "filename",
        "source_key",
        "checksum",
        "storage_key",
        "content_type",
        "size_bytes",
        "width",
        "height",
        "state",
        "actor",
        "created_at"
      ]
    },
    {
      "name": "cloud_publication_presence",
      "columns": [
        "remote_id",
        "page_id",
        "observed_status",
        "observed_at",
        "first_unavailable_at",
        "checked_at",
        "check_result",
        "reason"
      ]
    },
    {
      "name": "cloud_review_requests",
      "columns": [
        "request_id",
        "fingerprint",
        "review_id"
      ]
    },
    {
      "name": "cloud_reviews",
      "columns": [
        "id",
        "request_id",
        "fingerprint",
        "post_id",
        "version_id",
        "check_version",
        "asset_checksum",
        "footer_version",
        "source_snapshot",
        "body_snapshot",
        "caption_snapshot",
        "rubric_json",
        "reviewer",
        "checked_at"
      ]
    },
    {
      "name": "cloud_runtime",
      "columns": [
        "id",
        "environment",
        "last_scheduled_at",
        "heartbeat_count"
      ]
    },
    {
      "name": "content_checks",
      "columns": [
        "id",
        "version_id",
        "check_version",
        "asset_checksum",
        "footer_version",
        "reviewer",
        "checked_at",
        "accuracy",
        "usefulness",
        "clarity",
        "originality",
        "visual_quality",
        "mandatory_pass"
      ]
    },
    {
      "name": "content_entries",
      "columns": [
        "post_id",
        "active_version_id",
        "concept",
        "angle",
        "stable_order",
        "stage"
      ]
    },
    {
      "name": "content_imports",
      "columns": [
        "batch_id",
        "checksum",
        "imported_at"
      ]
    },
    {
      "name": "editor_imports",
      "columns": [
        "batch_id",
        "fingerprint"
      ]
    },
    {
      "name": "editor_render_receipts",
      "columns": [
        "asset_id",
        "version_id",
        "input_json",
        "input_checksum",
        "dependency_json",
        "created_at"
      ]
    },
    {
      "name": "editor_requests",
      "columns": [
        "request_id",
        "fingerprint",
        "result_version_id"
      ]
    },
    {
      "name": "editor_reviews",
      "columns": [
        "id",
        "version_id",
        "check_version",
        "body_snapshot",
        "caption_snapshot",
        "asset_checksum",
        "footer_version",
        "source_note",
        "rubric_json",
        "reviewer",
        "checked_at"
      ]
    },
    {
      "name": "editor_revisions",
      "columns": [
        "version_id",
        "parent_version_id",
        "restored_from_id",
        "action",
        "actor",
        "created_at"
      ]
    },
    {
      "name": "facts",
      "columns": [
        "id",
        "source_id",
        "fact_key",
        "value_json",
        "cohort",
        "status",
        "review_due_at"
      ]
    },
    {
      "name": "incidents",
      "columns": [
        "incident_key",
        "environment",
        "page_connection_id",
        "job_id",
        "evidence_id",
        "code",
        "opened_at",
        "status"
      ]
    },
    {
      "name": "job_claims",
      "columns": [
        "job_id",
        "check_version",
        "asset_id",
        "asset_key",
        "asset_size",
        "operation_generation",
        "created_at"
      ]
    },
    {
      "name": "notification_outbox",
      "columns": [
        "event_id",
        "publication_id",
        "payload_json",
        "state",
        "tries",
        "next_at",
        "message_id",
        "last_error"
      ]
    },
    {
      "name": "operation_events",
      "columns": [
        "seq",
        "environment",
        "job_id",
        "action",
        "actor",
        "occurred_at",
        "previous_state",
        "new_state",
        "reason"
      ]
    },
    {
      "name": "page_connections",
      "columns": [
        "id",
        "environment",
        "page_id",
        "page_name"
      ]
    },
    {
      "name": "page_publish_gates",
      "columns": [
        "page_connection_id",
        "active_job_id",
        "generation",
        "lease_until"
      ]
    },
    {
      "name": "post_prerequisites",
      "columns": [
        "post_id",
        "prerequisite_id"
      ]
    },
    {
      "name": "post_versions",
      "columns": [
        "id",
        "post_id",
        "version",
        "body",
        "caption_title",
        "image_headline",
        "image_points",
        "image_description",
        "primary_audience",
        "metadata_json",
        "asset_id",
        "status",
        "review_due_at",
        "check_version"
      ]
    },
    {
      "name": "posts",
      "columns": [
        "id",
        "batch_id",
        "content_key",
        "topic_group",
        "pool",
        "created_at"
      ]
    },
    {
      "name": "production_post_usage",
      "columns": [
        "page_connection_id",
        "post_id",
        "first_publication_id",
        "used_at"
      ]
    },
    {
      "name": "publication_dates",
      "columns": [
        "publication_id",
        "evidence_id",
        "remote_published_at",
        "business_date"
      ]
    },
    {
      "name": "publications",
      "columns": [
        "id",
        "job_id",
        "remote_id",
        "remote_link",
        "caption_snapshot",
        "asset_checksum",
        "footer_version",
        "confirmed_at",
        "remote_published_at",
        "remote_business_date"
      ]
    },
    {
      "name": "publish_evidence",
      "columns": [
        "id",
        "attempt_id",
        "event_key",
        "outcome",
        "remote_id",
        "observed_at",
        "normalized_json",
        "state",
        "next_at",
        "last_error"
      ]
    },
    {
      "name": "publish_jobs",
      "columns": [
        "id",
        "page_connection_id",
        "slot_id",
        "request_id",
        "post_version_id",
        "caption_snapshot",
        "asset_checksum",
        "footer_version",
        "state",
        "owner_token",
        "generation",
        "lease_until",
        "attempt_count",
        "next_attempt_at"
      ]
    },
    {
      "name": "schedule_slots",
      "columns": [
        "id",
        "page_connection_id",
        "business_date",
        "planned_post_id",
        "status"
      ]
    },
    {
      "name": "schema_migrations",
      "columns": [
        "name",
        "checksum"
      ]
    },
    {
      "name": "simulation_schedules",
      "columns": [
        "page_connection_id",
        "start_date"
      ]
    },
    {
      "name": "simulation_settings",
      "columns": [
        "id",
        "enabled"
      ]
    },
    {
      "name": "sources",
      "columns": [
        "id",
        "title",
        "revision",
        "locator",
        "authority",
        "status",
        "reviewed_at",
        "review_due_at"
      ]
    },
    {
      "name": "stock_alert_state",
      "columns": [
        "page_connection_id",
        "level",
        "episode",
        "eligible_count"
      ]
    },
    {
      "name": "version_facts",
      "columns": [
        "version_id",
        "fact_id"
      ]
    },
    {
      "name": "version_sources",
      "columns": [
        "version_id",
        "source_id",
        "location"
      ]
    }
  ],
  "extra": [
    {
      "path": "fonts/BricolageGrotesque-Bold.ttf",
      "sha256": "a737b146fe0d77ffe8a86e3cd16700dd431d3b1e420d4fd80e142cd68a1cb50d",
      "size": 90952
    },
    {
      "path": "fonts/WorkSans-Bold.ttf",
      "sha256": "240d125fc9f8561363dc1ea3f513501253bd70942f41468f48f0b0cafb0c82e2",
      "size": 191304
    },
    {
      "path": "fonts/WorkSans-Regular.ttf",
      "sha256": "e67985a843df0d3cdee51a3d0f329eb1774a344ad9ff0c9ab923751f1577e2a4",
      "size": 188916
    },
    {
      "path": "fonts/BricolageGrotesque-OFL.txt",
      "sha256": "0e4f4eb8534bc66a76aca13dd19c1f9731b2008866b29ccff182b764649df9b4",
      "size": 4403
    },
    {
      "path": "fonts/WorkSans-OFL.txt",
      "sha256": "ace8c22a3326318b54e67c3691857929634205533f454a70ef5a3473ddb2e2ba",
      "size": 4397
    }
  ]
};
