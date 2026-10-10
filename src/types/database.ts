
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admin_audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"id": string,"metadata": NonNullable<Json>,"target_id": string | null,"target_type": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"target_id"?: string | null,"target_type"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"app_admins": {
                  Row: {
                    "granted_at": string,"granted_by": string,"role": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string,"role": string,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string,"role"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"assignment_events": {
                  Row: {
                    "actor": string,"assignment_id": string,"created_at": string,"from_status": Database["public"]['Enums']["assignment_status"] | null,"id": string,"to_status": Database["public"]['Enums']["assignment_status"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor"?: string,"assignment_id": string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["assignment_status"] | null,"id"?: string,"to_status": Database["public"]['Enums']["assignment_status"],"user_id": string
                  }
                  Update: {
                    "actor"?: string,"assignment_id"?: string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["assignment_status"] | null,"id"?: string,"to_status"?: Database["public"]['Enums']["assignment_status"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assignment_events_assignment_id_fkey"
      columns: ["assignment_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id"]
    }
                  ]
                },"assignment_transitions": {
                  Row: {
                    "from_status": Database["public"]['Enums']["assignment_status"],"to_status": Database["public"]['Enums']["assignment_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "from_status": Database["public"]['Enums']["assignment_status"],"to_status": Database["public"]['Enums']["assignment_status"]
                  }
                  Update: {
                    "from_status"?: Database["public"]['Enums']["assignment_status"],"to_status"?: Database["public"]['Enums']["assignment_status"]
                  }
                  Relationships: [
                    
                  ]
                },"assignments": {
                  Row: {
                    "canceled_at": string | null,"channels": (Database["public"]['Enums']["notification_channel"])[],"commitment": string | null,"completed_at": string | null,"completion_policy": Database["public"]['Enums']["completion_policy"],"created_at": string,"description": string | null,"due_at": string,"estimated_minutes": number | null,"id": string,"is_recovery_plan": boolean,"original_due_at": string | null,"overdue_at": string | null,"paused_at": string | null,"priority": Database["public"]['Enums']["assignment_priority"],"reminder_intensity": Database["public"]['Enums']["reminder_intensity"],"schedule_version": number,"status": Database["public"]['Enums']["assignment_status"],"subject": string | null,"submitted_at": string | null,"time_zone": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "canceled_at"?: string | null,"channels"?: (Database["public"]['Enums']["notification_channel"])[],"commitment"?: string | null,"completed_at"?: string | null,"completion_policy"?: Database["public"]['Enums']["completion_policy"],"created_at"?: string,"description"?: string | null,"due_at": string,"estimated_minutes"?: number | null,"id"?: string,"is_recovery_plan"?: boolean,"original_due_at"?: string | null,"overdue_at"?: string | null,"paused_at"?: string | null,"priority"?: Database["public"]['Enums']["assignment_priority"],"reminder_intensity"?: Database["public"]['Enums']["reminder_intensity"],"schedule_version"?: number,"status"?: Database["public"]['Enums']["assignment_status"],"subject"?: string | null,"submitted_at"?: string | null,"time_zone": string,"title": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "canceled_at"?: string | null,"channels"?: (Database["public"]['Enums']["notification_channel"])[],"commitment"?: string | null,"completed_at"?: string | null,"completion_policy"?: Database["public"]['Enums']["completion_policy"],"created_at"?: string,"description"?: string | null,"due_at"?: string,"estimated_minutes"?: number | null,"id"?: string,"is_recovery_plan"?: boolean,"original_due_at"?: string | null,"overdue_at"?: string | null,"paused_at"?: string | null,"priority"?: Database["public"]['Enums']["assignment_priority"],"reminder_intensity"?: Database["public"]['Enums']["reminder_intensity"],"schedule_version"?: number,"status"?: Database["public"]['Enums']["assignment_status"],"subject"?: string | null,"submitted_at"?: string | null,"time_zone"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"contact_methods": {
                  Row: {
                    "contact_type": string,"created_at": string,"id": string,"is_active": boolean,"normalized_value": string,"updated_at": string,"user_id": string,"value_hash": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_type"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"normalized_value": string,"updated_at"?: string,"user_id": string,"value_hash": string,"verified_at"?: string | null
                  }
                  Update: {
                    "contact_type"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"normalized_value"?: string,"updated_at"?: string,"user_id"?: string,"value_hash"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"dev_outbox": {
                  Row: {
                    "body": string,"channel": string,"created_at": string,"id": string,"kind": string | null,"to_masked": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"channel": string,"created_at"?: string,"id"?: string,"kind"?: string | null,"to_masked": string,"user_id"?: string | null
                  }
                  Update: {
                    "body"?: string,"channel"?: string,"created_at"?: string,"id"?: string,"kind"?: string | null,"to_masked"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"notification_consents": {
                  Row: {
                    "agreement_version": string,"category": Database["public"]['Enums']["consent_category"],"consent_source": string,"consent_status": Database["public"]['Enums']["consent_status"],"contact_method_id": string | null,"granted_at": string,"id": string,"metadata": NonNullable<Json>,"revocation_source": string | null,"revoked_at": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_version": string,"category": Database["public"]['Enums']["consent_category"],"consent_source": string,"consent_status"?: Database["public"]['Enums']["consent_status"],"contact_method_id"?: string | null,"granted_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"revocation_source"?: string | null,"revoked_at"?: string | null,"user_id": string
                  }
                  Update: {
                    "agreement_version"?: string,"category"?: Database["public"]['Enums']["consent_category"],"consent_source"?: string,"consent_status"?: Database["public"]['Enums']["consent_status"],"contact_method_id"?: string | null,"granted_at"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"revocation_source"?: string | null,"revoked_at"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_consents_contact_method_id_fkey"
      columns: ["contact_method_id"]
isOneToOne: false
      referencedRelation: "contact_methods"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_events": {
                  Row: {
                    "assignment_id": string | null,"channel": Database["public"]['Enums']["notification_channel"] | null,"event_type": string,"id": string,"metadata": NonNullable<Json>,"occurred_at": string,"provider_status": string | null,"reminder_job_id": string | null,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id"?: string | null,"channel"?: Database["public"]['Enums']["notification_channel"] | null,"event_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"provider_status"?: string | null,"reminder_job_id"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "assignment_id"?: string | null,"channel"?: Database["public"]['Enums']["notification_channel"] | null,"event_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"occurred_at"?: string,"provider_status"?: string | null,"reminder_job_id"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notification_events_assignment_id_fkey"
      columns: ["assignment_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notification_events_reminder_job_id_fkey"
      columns: ["reminder_job_id"]
isOneToOne: false
      referencedRelation: "reminder_jobs"
      referencedColumns: ["id"]
    }
                  ]
                },"notification_preferences": {
                  Row: {
                    "completion_messages_enabled": boolean,"first_reminder_lead_hours": number | null,"follow_up_interval_hours": number | null,"max_daily_notifications": number,"overdue_interval_hours": number | null,"quiet_hours_end": string,"quiet_hours_start": string,"reminder_intensity": Database["public"]['Enums']["reminder_intensity"],"sms_enabled": boolean,"summaries_enabled": boolean,"time_zone": string,"updated_at": string,"user_id": string,"voice_call_lead_minutes": number,"voice_calls_enabled": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "completion_messages_enabled"?: boolean,"first_reminder_lead_hours"?: number | null,"follow_up_interval_hours"?: number | null,"max_daily_notifications"?: number,"overdue_interval_hours"?: number | null,"quiet_hours_end"?: string,"quiet_hours_start"?: string,"reminder_intensity"?: Database["public"]['Enums']["reminder_intensity"],"sms_enabled"?: boolean,"summaries_enabled"?: boolean,"time_zone"?: string,"updated_at"?: string,"user_id": string,"voice_call_lead_minutes"?: number,"voice_calls_enabled"?: boolean
                  }
                  Update: {
                    "completion_messages_enabled"?: boolean,"first_reminder_lead_hours"?: number | null,"follow_up_interval_hours"?: number | null,"max_daily_notifications"?: number,"overdue_interval_hours"?: number | null,"quiet_hours_end"?: string,"quiet_hours_start"?: string,"reminder_intensity"?: Database["public"]['Enums']["reminder_intensity"],"sms_enabled"?: boolean,"summaries_enabled"?: boolean,"time_zone"?: string,"updated_at"?: string,"user_id"?: string,"voice_call_lead_minutes"?: number,"voice_calls_enabled"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"phone_suppressions": {
                  Row: {
                    "created_at": string,"lifted_at": string | null,"phone_hash": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"lifted_at"?: string | null,"phone_hash": string,"reason": string
                  }
                  Update: {
                    "created_at"?: string,"lifted_at"?: string | null,"phone_hash"?: string,"reason"?: string
                  }
                  Relationships: [
                    
                  ]
                },"phone_verifications": {
                  Row: {
                    "attempts": number,"code_hash": string | null,"created_at": string,"expires_at": string,"id": string,"max_attempts": number,"phone_e164": string,"phone_hash": string,"status": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts"?: number,"code_hash"?: string | null,"created_at"?: string,"expires_at": string,"id"?: string,"max_attempts"?: number,"phone_e164": string,"phone_hash": string,"status"?: string,"user_id": string
                  }
                  Update: {
                    "attempts"?: number,"code_hash"?: string | null,"created_at"?: string,"expires_at"?: string,"id"?: string,"max_attempts"?: number,"phone_e164"?: string,"phone_hash"?: string,"status"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "age_confirmed_at": string | null,"created_at": string,"deletion_requested_at": string | null,"display_name": string,"id": string,"onboarding_completed": boolean,"terms_accepted_at": string | null,"terms_version": string | null,"time_zone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "age_confirmed_at"?: string | null,"created_at"?: string,"deletion_requested_at"?: string | null,"display_name"?: string,"id": string,"onboarding_completed"?: boolean,"terms_accepted_at"?: string | null,"terms_version"?: string | null,"time_zone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "age_confirmed_at"?: string | null,"created_at"?: string,"deletion_requested_at"?: string | null,"display_name"?: string,"id"?: string,"onboarding_completed"?: boolean,"terms_accepted_at"?: string | null,"terms_version"?: string | null,"time_zone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rate_limit_hits": {
                  Row: {
                    "bucket": string,"created_at": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bucket": string,"created_at"?: string,"id"?: never
                  }
                  Update: {
                    "bucket"?: string,"created_at"?: string,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"reminder_jobs": {
                  Row: {
                    "assignment_id": string,"attempt_count": number,"cancel_reason": string | null,"canceled_at": string | null,"channel": Database["public"]['Enums']["notification_channel"],"created_at": string,"delivered_at": string | null,"failure_category": string | null,"id": string,"kind": Database["public"]['Enums']["reminder_kind"],"last_attempt_at": string | null,"locked_until": string | null,"max_attempts": number,"occurrence_key": string,"original_scheduled_at": string,"provider_message_id": string | null,"schedule_version": number,"scheduled_at": string,"sent_at": string | null,"simulated": boolean,"status": Database["public"]['Enums']["reminder_job_status"],"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id": string,"attempt_count"?: number,"cancel_reason"?: string | null,"canceled_at"?: string | null,"channel": Database["public"]['Enums']["notification_channel"],"created_at"?: string,"delivered_at"?: string | null,"failure_category"?: string | null,"id"?: string,"kind": Database["public"]['Enums']["reminder_kind"],"last_attempt_at"?: string | null,"locked_until"?: string | null,"max_attempts"?: number,"occurrence_key": string,"original_scheduled_at": string,"provider_message_id"?: string | null,"schedule_version": number,"scheduled_at": string,"sent_at"?: string | null,"simulated"?: boolean,"status"?: Database["public"]['Enums']["reminder_job_status"],"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "assignment_id"?: string,"attempt_count"?: number,"cancel_reason"?: string | null,"canceled_at"?: string | null,"channel"?: Database["public"]['Enums']["notification_channel"],"created_at"?: string,"delivered_at"?: string | null,"failure_category"?: string | null,"id"?: string,"kind"?: Database["public"]['Enums']["reminder_kind"],"last_attempt_at"?: string | null,"locked_until"?: string | null,"max_attempts"?: number,"occurrence_key"?: string,"original_scheduled_at"?: string,"provider_message_id"?: string | null,"schedule_version"?: number,"scheduled_at"?: string,"sent_at"?: string | null,"simulated"?: boolean,"status"?: Database["public"]['Enums']["reminder_job_status"],"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "reminder_jobs_assignment_id_fkey"
      columns: ["assignment_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id"]
    }
                  ]
                },"submissions": {
                  Row: {
                    "assignment_id": string,"deleted_at": string | null,"file_size_bytes": number,"height": number | null,"id": string,"mime_type": string,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"self_attested": boolean,"status": Database["public"]['Enums']["submission_status"],"storage_path": string,"submitted_at": string,"user_id": string,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "assignment_id": string,"deleted_at"?: string | null,"file_size_bytes": number,"height"?: number | null,"id"?: string,"mime_type": string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"self_attested"?: boolean,"status": Database["public"]['Enums']["submission_status"],"storage_path": string,"submitted_at"?: string,"user_id": string,"width"?: number | null
                  }
                  Update: {
                    "assignment_id"?: string,"deleted_at"?: string | null,"file_size_bytes"?: number,"height"?: number | null,"id"?: string,"mime_type"?: string,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"self_attested"?: boolean,"status"?: Database["public"]['Enums']["submission_status"],"storage_path"?: string,"submitted_at"?: string,"user_id"?: string,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_assignment_id_fkey"
      columns: ["assignment_id"]
isOneToOne: false
      referencedRelation: "assignments"
      referencedColumns: ["id"]
    }
                  ]
                },"system_settings": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"webhook_events": {
                  Row: {
                    "error_category": string | null,"event_type": string,"id": string,"processed_at": string | null,"processing_status": string,"provider": string,"provider_event_id": string,"received_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "error_category"?: string | null,"event_type": string,"id"?: string,"processed_at"?: string | null,"processing_status"?: string,"provider": string,"provider_event_id": string,"received_at"?: string
                  }
                  Update: {
                    "error_category"?: string | null,"event_type"?: string,"id"?: string,"processed_at"?: string | null,"processing_status"?: string,"provider"?: string,"provider_event_id"?: string,"received_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_metrics":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_retry_job":
{ Args: { "p_admin_id": string,"p_job_id": string }; Returns: boolean
                           },
"approve_phone_verification":
{ Args: { "p_user_id": string,"p_verification_id": string }; Returns: {
              "contact_type": string,
"created_at": string,
"id": string,
"is_active": boolean,
"normalized_value": string,
"updated_at": string,
"user_id": string,
"value_hash": string,
"verified_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "contact_methods"
        isOneToOne: true
        isSetofReturn: false
      } },
"begin_phone_verification_attempt":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"cancel_pending_jobs":
{ Args: { "p_assignment_id": string,"p_channel"?: Database["public"]['Enums']["notification_channel"],"p_reason": string }; Returns: number
                           },
"cancel_user_jobs":
{ Args: { "p_channel"?: Database["public"]['Enums']["notification_channel"],"p_reason": string,"p_user_id": string }; Returns: number
                           },
"claim_due_reminder_jobs":
{ Args: { "p_limit"?: number }; Returns: string[]
                           },
"claim_reminder_job":
{ Args: { "p_job_id": string }; Returns: boolean
                           },
"confirm_job_sendable":
{ Args: { "p_job_id": string }; Returns: boolean
                           },
"consent_category_for":
{ Args: { "p_channel": Database["public"]['Enums']["notification_channel"] }; Returns: Database["public"]['Enums']["consent_category"]
                           },
"consume_rate_limit":
{ Args: { "p_bucket": string,"p_limit": number,"p_window_seconds": number }; Returns: boolean
                           },
"create_assignment":
{ Args: { "p_payload": Json,"p_user_id": string }; Returns: {
              "canceled_at": string | null,
"channels": (Database["public"]['Enums']["notification_channel"])[],
"commitment": string | null,
"completed_at": string | null,
"completion_policy": Database["public"]['Enums']["completion_policy"],
"created_at": string,
"description": string | null,
"due_at": string,
"estimated_minutes": number | null,
"id": string,
"is_recovery_plan": boolean,
"original_due_at": string | null,
"overdue_at": string | null,
"paused_at": string | null,
"priority": Database["public"]['Enums']["assignment_priority"],
"reminder_intensity": Database["public"]['Enums']["reminder_intensity"],
"schedule_version": number,
"status": Database["public"]['Enums']["assignment_status"],
"subject": string | null,
"submitted_at": string | null,
"time_zone": string,
"title": string,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "assignments"
        isOneToOne: true
        isSetofReturn: false
      } },
"create_phone_verification":
{ Args: { "p_code_hash": string,"p_phone_e164": string,"p_phone_hash": string,"p_ttl_seconds": number,"p_user_id": string }; Returns: string
                           },
"create_submission":
{ Args: { "p_assignment_id": string,"p_file_size_bytes": number,"p_height": number,"p_mime_type": string,"p_self_attested": boolean,"p_storage_path": string,"p_submission_id": string,"p_user_id": string,"p_width": number }; Returns: Json
                           },
"delete_submission_evidence":
{ Args: { "p_submission_id": string,"p_user_id": string }; Returns: string
                           },
"expire_old_evidence":
{ Args: { "p_retention_days": number }; Returns: (string)[]
                           },
"finalize_reminder_job":
{ Args: { "p_details"?: Json,"p_job_id": string,"p_outcome": string }; Returns: string
                           },
"get_dispatch_context":
{ Args: { "p_job_id": string }; Returns: Json
                           },
"is_admin":
{ Args: { "p_role"?: string,"p_user_id": string }; Returns: boolean
                           },
"is_valid_time_zone":
{ Args: { "p_tz": string }; Returns: boolean
                           },
"mark_overdue_assignments":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"prepare_account_deletion":
{ Args: { "p_user_id": string }; Returns: (string)[]
                           },
"process_inbound_keyword":
{ Args: { "p_agreement_version": string,"p_keyword": string,"p_phone_hash": string }; Returns: (string)[]
                           },
"purge_operational_data":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"record_consent":
{ Args: { "p_agreement_version": string,"p_category": Database["public"]['Enums']["consent_category"],"p_grant": boolean,"p_metadata"?: Json,"p_source": string,"p_user_id": string }; Returns: Json
                           },
"record_delivery_status":
{ Args: { "p_error_code"?: string,"p_provider_message_id": string,"p_provider_status": string,"p_status": string }; Returns: boolean
                           },
"reminder_limit":
{ Args: { "p_key": string }; Returns: number
                           },
"remove_phone":
{ Args: { "p_user_id": string }; Returns: number
                           },
"review_submission":
{ Args: { "p_decision": string,"p_note"?: string,"p_reviewer_id": string,"p_submission_id": string }; Returns: Json
                           },
"sync_reminder_jobs":
{ Args: { "p_assignment_id": string,"p_jobs": Json,"p_schedule_version": number }; Returns: Json
                           },
"transition_assignment":
{ Args: { "p_action": string,"p_assignment_id": string,"p_user_id": string }; Returns: {
              "canceled_at": string | null,
"channels": (Database["public"]['Enums']["notification_channel"])[],
"commitment": string | null,
"completed_at": string | null,
"completion_policy": Database["public"]['Enums']["completion_policy"],
"created_at": string,
"description": string | null,
"due_at": string,
"estimated_minutes": number | null,
"id": string,
"is_recovery_plan": boolean,
"original_due_at": string | null,
"overdue_at": string | null,
"paused_at": string | null,
"priority": Database["public"]['Enums']["assignment_priority"],
"reminder_intensity": Database["public"]['Enums']["reminder_intensity"],
"schedule_version": number,
"status": Database["public"]['Enums']["assignment_status"],
"subject": string | null,
"submitted_at": string | null,
"time_zone": string,
"title": string,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "assignments"
        isOneToOne: true
        isSetofReturn: false
      } },
"update_assignment":
{ Args: { "p_assignment_id": string,"p_payload": Json,"p_user_id": string }; Returns: {
              "canceled_at": string | null,
"channels": (Database["public"]['Enums']["notification_channel"])[],
"commitment": string | null,
"completed_at": string | null,
"completion_policy": Database["public"]['Enums']["completion_policy"],
"created_at": string,
"description": string | null,
"due_at": string,
"estimated_minutes": number | null,
"id": string,
"is_recovery_plan": boolean,
"original_due_at": string | null,
"overdue_at": string | null,
"paused_at": string | null,
"priority": Database["public"]['Enums']["assignment_priority"],
"reminder_intensity": Database["public"]['Enums']["reminder_intensity"],
"schedule_version": number,
"status": Database["public"]['Enums']["assignment_status"],
"subject": string | null,
"submitted_at": string | null,
"time_zone": string,
"title": string,
"updated_at": string,
"user_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "assignments"
        isOneToOne: true
        isSetofReturn: false
      } }
          }
          Enums: {
            "assignment_priority": "low"|"normal"|"high","assignment_status": "draft"|"active"|"submitted"|"under_review"|"completed"|"overdue"|"paused"|"canceled","completion_policy": "self_attested"|"review_required","consent_category": "sms_reminders"|"voice_reminders"|"marketing","consent_status": "granted"|"revoked","notification_channel": "sms"|"voice","reminder_intensity": "gentle"|"standard"|"intensive","reminder_job_status": "scheduled"|"processing"|"sent"|"delivered"|"failed"|"canceled"|"skipped","reminder_kind": "follow_up"|"before_deadline"|"due_now"|"overdue"|"voice_call","submission_status": "pending_review"|"accepted"|"rejected"|"withdrawn"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "assignment_priority": ["low", "normal", "high"],"assignment_status": ["draft", "active", "submitted", "under_review", "completed", "overdue", "paused", "canceled"],"completion_policy": ["self_attested", "review_required"],"consent_category": ["sms_reminders", "voice_reminders", "marketing"],"consent_status": ["granted", "revoked"],"notification_channel": ["sms", "voice"],"reminder_intensity": ["gentle", "standard", "intensive"],"reminder_job_status": ["scheduled", "processing", "sent", "delivered", "failed", "canceled", "skipped"],"reminder_kind": ["follow_up", "before_deadline", "due_now", "overdue", "voice_call"],"submission_status": ["pending_review", "accepted", "rejected", "withdrawn"]
          }
        }
} as const
