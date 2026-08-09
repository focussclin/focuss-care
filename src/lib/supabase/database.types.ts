/**
 * GERADO AUTOMATICAMENTE — NAO EDITE A MAO.
 *
 * Fonte: schema real do projeto Supabase (documento OpenAPI do PostgREST).
 * Regenerar com:  npm run db:types
 *
 * Tabelas: 56 · Views: 1 · Enums: 32
 *
 * Nota sobre Insert: o OpenAPI nao expoe DEFAULTs, entao id/created_at/
 * updated_at sao tratados como opcionais. Demais colunas NOT NULL entram
 * como obrigatorias.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export type AiFeature =
  | 'patient_chat'
  | 'staff_assistant'
  | 'record_summary'
  | 'smart_scheduling'
  | 'financial_analysis'
  | 'report_generation'
  | 'embedding'

export type AiRole =
  | 'system'
  | 'user'
  | 'assistant'
  | 'tool'

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'canceled'
  | 'no_show'

export type AuthorizationStatus =
  | 'requested'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'used'
  | 'canceled'

export type AvailabilityKind =
  | 'block'
  | 'extra'

export type BiologicalSex =
  | 'female'
  | 'male'
  | 'intersex'
  | 'not_informed'

export type CashEntryKind =
  | 'in'
  | 'out'

export type CashSessionStatus =
  | 'open'
  | 'closed'

export type ChannelProvider =
  | 'cloud_api'
  | 'evolution'
  | 'zapi'
  | 'twilio'
  | 'other'

export type IntegrationCredentialProvider =
  | 'brevo'
  | 'evolution'
  | 'deepseek'
  | 'google_calendar'
  | 'outlook_calendar'

export type ClaimDenialStatus =
  | 'received'
  | 'appealing'
  | 'recovered'
  | 'accepted'

export type ClinicStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'canceled'

export type ConsentPurpose =
  | 'terms_of_service'
  | 'privacy_policy'
  | 'health_data_processing'
  | 'marketing_communication'
  | 'ai_assisted_processing'

export type ContractType =
  | 'clt'
  | 'pj'
  | 'autonomo'
  | 'estagio'
  | 'temporario'

export type ConversationStatus =
  | 'open'
  | 'pending'
  | 'resolved'
  | 'archived'

export type CouncilType =
  | 'CRM'
  | 'CRO'
  | 'CRP'
  | 'CREFITO'
  | 'CRN'
  | 'CRF'
  | 'COREN'
  | 'CREF'
  | 'CRFa'
  | 'OUTRO'

export type EncounterStatus =
  | 'open'
  | 'closed'
  | 'canceled'

export type InvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'canceled'

export type MembershipRole =
  | 'owner'
  | 'admin'
  | 'professional'
  | 'receptionist'
  | 'finance'

export type MembershipStatus =
  | 'invited'
  | 'active'
  | 'suspended'
  | 'revoked'

export type MessageDirection =
  | 'inbound'
  | 'outbound'

export type MessageStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'

export type PatientDocumentKind =
  | 'rg'
  | 'cpf'
  | 'cns'
  | 'passport'
  | 'insurance_card'
  | 'consent_form'
  | 'other'

export type PayerType =
  | 'patient'
  | 'insurance'

export type PaymentMethod =
  | 'cash'
  | 'pix'
  | 'debit_card'
  | 'credit_card'
  | 'bank_transfer'
  | 'insurance'
  | 'check'
  | 'other'

export type PayoutStatus =
  | 'draft'
  | 'approved'
  | 'paid'
  | 'canceled'

export type QueueStatus =
  | 'waiting'
  | 'called'
  | 'in_service'
  | 'done'
  | 'abandoned'

export type RecordType =
  | 'anamnesis'
  | 'evolution'
  | 'physical_exam'
  | 'diagnosis'
  | 'procedure'
  | 'exam_request'
  | 'referral'
  | 'certificate'
  | 'note'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'

export type TimeOffKind =
  | 'ferias'
  | 'atestado'
  | 'folga'
  | 'licenca'
  | 'falta'
  | 'banco_horas'

export type TimeOffStatus =
  | 'requested'
  | 'approved'
  | 'denied'
  | 'canceled'

export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'

export type WorkflowTrigger =
  | 'appointment_created'
  | 'appointment_confirmed'
  | 'appointment_reminder'
  | 'appointment_no_show'
  | 'encounter_finished'
  | 'invoice_issued'
  | 'invoice_overdue'
  | 'patient_birthday'
  | 'schedule'

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
export type Database = {
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          id: string
          clinic_id: string
          user_id: string | null
          patient_id: string | null
          feature: AiFeature
          title: string | null
          is_archived: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          user_id?: string | null
          patient_id?: string | null
          feature: AiFeature
          title?: string | null
          is_archived: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          user_id?: string | null
          patient_id?: string | null
          feature?: AiFeature
          title?: string | null
          is_archived?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ai_conversations_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_conversations_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_conversations_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
        ]
      }
      ai_messages: {
        Row: {
          id: string
          clinic_id: string
          conversation_id: string
          role: AiRole
          content: Json
          model: string | null
          tool_calls: Json | null
          input_tokens: number | null
          output_tokens: number | null
          stop_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          conversation_id: string
          role: AiRole
          content: Json
          model?: string | null
          tool_calls?: Json | null
          input_tokens?: number | null
          output_tokens?: number | null
          stop_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          conversation_id?: string
          role?: AiRole
          content?: Json
          model?: string | null
          tool_calls?: Json | null
          input_tokens?: number | null
          output_tokens?: number | null
          stop_reason?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'ai_messages_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'ai_messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'ai_conversations'
            referencedColumns: ['id']
          },
        ]
      }
      ai_usage_log: {
        Row: {
          id: number
          clinic_id: string
          user_id: string | null
          feature: AiFeature
          model: string
          conversation_id: string | null
          input_tokens: number
          output_tokens: number
          cache_read_tokens: number
          cache_creation_tokens: number
          cost_usd_micros: number
          latency_ms: number | null
          was_error: boolean
          occurred_at: string
        }
        Insert: {
          id?: number
          clinic_id: string
          user_id?: string | null
          feature: AiFeature
          model: string
          conversation_id?: string | null
          input_tokens: number
          output_tokens: number
          cache_read_tokens: number
          cache_creation_tokens: number
          cost_usd_micros: number
          latency_ms?: number | null
          was_error: boolean
          occurred_at: string
        }
        Update: {
          id?: number
          clinic_id?: string
          user_id?: string | null
          feature?: AiFeature
          model?: string
          conversation_id?: string | null
          input_tokens?: number
          output_tokens?: number
          cache_read_tokens?: number
          cache_creation_tokens?: number
          cost_usd_micros?: number
          latency_ms?: number | null
          was_error?: boolean
          occurred_at?: string
        }
        Relationships: []
      }
      allergies: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          substance: string
          reaction: string | null
          severity: number | null
          is_active: boolean
          recorded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          substance: string
          reaction?: string | null
          severity?: number | null
          is_active: boolean
          recorded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          substance?: string
          reaction?: string | null
          severity?: number | null
          is_active?: boolean
          recorded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'allergies_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'allergies_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'allergies_recorded_by_fkey'
            columns: ['recorded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      appointment_status_history: {
        Row: {
          id: string
          clinic_id: string
          appointment_id: string
          from_status: AppointmentStatus | null
          to_status: AppointmentStatus
          changed_by: string | null
          reason: string | null
          changed_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          appointment_id: string
          from_status?: AppointmentStatus | null
          to_status: AppointmentStatus
          changed_by?: string | null
          reason?: string | null
          changed_at: string
        }
        Update: {
          id?: string
          clinic_id?: string
          appointment_id?: string
          from_status?: AppointmentStatus | null
          to_status?: AppointmentStatus
          changed_by?: string | null
          reason?: string | null
          changed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'appointment_status_history_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointment_status_history_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointment_status_history_changed_by_fkey'
            columns: ['changed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      appointments: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          professional_id: string
          status: AppointmentStatus
          starts_at: string
          ends_at: string
          reason: string | null
          internal_notes: string | null
          is_walk_in: boolean
          confirmed_at: string | null
          checked_in_at: string | null
          canceled_at: string | null
          cancel_reason: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          professional_id: string
          status: AppointmentStatus
          starts_at: string
          ends_at: string
          reason?: string | null
          internal_notes?: string | null
          is_walk_in: boolean
          confirmed_at?: string | null
          checked_in_at?: string | null
          canceled_at?: string | null
          cancel_reason?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          professional_id?: string
          status?: AppointmentStatus
          starts_at?: string
          ends_at?: string
          reason?: string | null
          internal_notes?: string | null
          is_walk_in?: boolean
          confirmed_at?: string | null
          checked_in_at?: string | null
          canceled_at?: string | null
          cancel_reason?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'appointments_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'appointments_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      audit_log: {
        Row: {
          id: number
          clinic_id: string | null
          actor_user_id: string | null
          actor_role: MembershipRole | null
          action: string
          entity_type: string
          entity_id: string | null
          before: Json | null
          after: Json | null
          ip: string | null
          user_agent: string | null
          occurred_at: string
        }
        Insert: {
          id?: number
          clinic_id?: string | null
          actor_user_id?: string | null
          actor_role?: MembershipRole | null
          action: string
          entity_type: string
          entity_id?: string | null
          before?: Json | null
          after?: Json | null
          ip?: string | null
          user_agent?: string | null
          occurred_at: string
        }
        Update: {
          id?: number
          clinic_id?: string | null
          actor_user_id?: string | null
          actor_role?: MembershipRole | null
          action?: string
          entity_type?: string
          entity_id?: string | null
          before?: Json | null
          after?: Json | null
          ip?: string | null
          user_agent?: string | null
          occurred_at?: string
        }
        Relationships: []
      }
      availability_exceptions: {
        Row: {
          id: string
          clinic_id: string
          professional_id: string | null
          kind: AvailabilityKind
          starts_at: string
          ends_at: string
          reason: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          professional_id?: string | null
          kind: AvailabilityKind
          starts_at: string
          ends_at: string
          reason?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          professional_id?: string | null
          kind?: AvailabilityKind
          starts_at?: string
          ends_at?: string
          reason?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'availability_exceptions_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'availability_exceptions_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'availability_exceptions_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      availability_rules: {
        Row: {
          id: string
          clinic_id: string
          professional_id: string
          weekday: number
          start_time: string
          end_time: string
          slot_minutes: number | null
          valid_from: string | null
          valid_until: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          professional_id: string
          weekday: number
          start_time: string
          end_time: string
          slot_minutes?: number | null
          valid_from?: string | null
          valid_until?: string | null
          is_active: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          professional_id?: string
          weekday?: number
          start_time?: string
          end_time?: string
          slot_minutes?: number | null
          valid_from?: string | null
          valid_until?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'availability_rules_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'availability_rules_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }
      cash_entries: {
        Row: {
          id: string
          clinic_id: string
          cash_session_id: string
          kind: CashEntryKind
          category: string | null
          amount_cents: number
          description: string
          payment_id: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          cash_session_id: string
          kind: CashEntryKind
          category?: string | null
          amount_cents: number
          description: string
          payment_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          cash_session_id?: string
          kind?: CashEntryKind
          category?: string | null
          amount_cents?: number
          description?: string
          payment_id?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cash_entries_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cash_entries_cash_session_id_fkey'
            columns: ['cash_session_id']
            isOneToOne: false
            referencedRelation: 'cash_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cash_entries_payment_id_fkey'
            columns: ['payment_id']
            isOneToOne: false
            referencedRelation: 'payments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cash_entries_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      cash_sessions: {
        Row: {
          id: string
          clinic_id: string
          status: CashSessionStatus
          opened_by: string | null
          opened_at: string
          opening_amount_cents: number
          closed_by: string | null
          closed_at: string | null
          expected_amount_cents: number | null
          counted_amount_cents: number | null
          difference_cents: number | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          status: CashSessionStatus
          opened_by?: string | null
          opened_at: string
          opening_amount_cents: number
          closed_by?: string | null
          closed_at?: string | null
          expected_amount_cents?: number | null
          counted_amount_cents?: number | null
          difference_cents?: number | null
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          status?: CashSessionStatus
          opened_by?: string | null
          opened_at?: string
          opening_amount_cents?: number
          closed_by?: string | null
          closed_at?: string | null
          expected_amount_cents?: number | null
          counted_amount_cents?: number | null
          difference_cents?: number | null
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'cash_sessions_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cash_sessions_opened_by_fkey'
            columns: ['opened_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'cash_sessions_closed_by_fkey'
            columns: ['closed_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      clinic_settings: {
        Row: {
          clinic_id: string
          business_hours: Json
          appointment_defaults: Json
          notification_prefs: Json
          branding: Json
          ai_enabled: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          business_hours: Json
          appointment_defaults: Json
          notification_prefs: Json
          branding: Json
          ai_enabled: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          business_hours?: Json
          appointment_defaults?: Json
          notification_prefs?: Json
          branding?: Json
          ai_enabled?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clinic_settings_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      clinic_integration_credentials: {
        Row: {
          id: string
          clinic_id: string
          provider: IntegrationCredentialProvider
          encrypted_payload: string
          key_version: number
          configured_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          provider: IntegrationCredentialProvider
          encrypted_payload: string
          key_version?: number
          configured_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          provider?: IntegrationCredentialProvider
          encrypted_payload?: string
          key_version?: number
          configured_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clinic_integration_credentials_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'clinic_integration_credentials_configured_by_fkey'
            columns: ['configured_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      clinical_attachments: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          encounter_id: string | null
          record_id: string | null
          title: string
          description: string | null
          storage_path: string
          file_name: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          encounter_id?: string | null
          record_id?: string | null
          title: string
          description?: string | null
          storage_path: string
          file_name: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          encounter_id?: string | null
          record_id?: string | null
          title?: string
          description?: string | null
          storage_path?: string
          file_name?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'clinical_attachments_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'clinical_attachments_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'clinical_attachments_encounter_id_fkey'
            columns: ['encounter_id']
            isOneToOne: false
            referencedRelation: 'encounters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'clinical_attachments_record_id_fkey'
            columns: ['record_id']
            isOneToOne: false
            referencedRelation: 'medical_records'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'clinical_attachments_uploaded_by_fkey'
            columns: ['uploaded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      clinics: {
        Row: {
          id: string
          slug: string
          trade_name: string
          legal_name: string | null
          cnpj: string | null
          status: ClinicStatus
          timezone: string
          locale: string
          logo_url: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          slug: string
          trade_name: string
          legal_name?: string | null
          cnpj?: string | null
          status: ClinicStatus
          timezone: string
          locale: string
          logo_url?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          slug?: string
          trade_name?: string
          legal_name?: string | null
          cnpj?: string | null
          status?: ClinicStatus
          timezone?: string
          locale?: string
          logo_url?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      consents: {
        Row: {
          id: string
          clinic_id: string | null
          subject_type: string
          subject_id: string
          purpose: ConsentPurpose
          document_version: string
          granted_at: string
          revoked_at: string | null
          ip: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          clinic_id?: string | null
          subject_type: string
          subject_id: string
          purpose: ConsentPurpose
          document_version: string
          granted_at: string
          revoked_at?: string | null
          ip?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          clinic_id?: string | null
          subject_type?: string
          subject_id?: string
          purpose?: ConsentPurpose
          document_version?: string
          granted_at?: string
          revoked_at?: string | null
          ip?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'consents_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      conversations: {
        Row: {
          id: string
          clinic_id: string
          channel_id: string | null
          patient_id: string | null
          contact_phone: string
          contact_name: string | null
          status: ConversationStatus
          assigned_to: string | null
          is_ai_handled: boolean
          last_message_at: string | null
          unread_count: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          channel_id?: string | null
          patient_id?: string | null
          contact_phone: string
          contact_name?: string | null
          status: ConversationStatus
          assigned_to?: string | null
          is_ai_handled: boolean
          last_message_at?: string | null
          unread_count: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          channel_id?: string | null
          patient_id?: string | null
          contact_phone?: string
          contact_name?: string | null
          status?: ConversationStatus
          assigned_to?: string | null
          is_ai_handled?: boolean
          last_message_at?: string | null
          unread_count?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'conversations_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_channel_id_fkey'
            columns: ['channel_id']
            isOneToOne: false
            referencedRelation: 'whatsapp_channels'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'conversations_assigned_to_fkey'
            columns: ['assigned_to']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      document_embeddings: {
        Row: {
          id: string
          clinic_id: string
          source_type: string
          source_id: string | null
          patient_id: string | null
          chunk_index: number
          content: string
          embedding: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          source_type: string
          source_id?: string | null
          patient_id?: string | null
          chunk_index: number
          content: string
          embedding?: string | null
          metadata: Json
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          source_type?: string
          source_id?: string | null
          patient_id?: string | null
          chunk_index?: number
          content?: string
          embedding?: string | null
          metadata?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'document_embeddings_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'document_embeddings_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
        ]
      }
      document_sequences: {
        Row: {
          clinic_id: string
          kind: string
          last_value: number
        }
        Insert: {
          clinic_id: string
          kind: string
          last_value: number
        }
        Update: {
          clinic_id?: string
          kind?: string
          last_value?: number
        }
        Relationships: [
          {
            foreignKeyName: 'document_sequences_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      employees: {
        Row: {
          id: string
          clinic_id: string
          user_id: string | null
          professional_id: string | null
          full_name: string
          role_title: string | null
          cpf: string | null
          contract_type: ContractType
          hire_date: string | null
          termination_date: string | null
          salary_cents: number | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          user_id?: string | null
          professional_id?: string | null
          full_name: string
          role_title?: string | null
          cpf?: string | null
          contract_type: ContractType
          hire_date?: string | null
          termination_date?: string | null
          salary_cents?: number | null
          notes?: string | null
          is_active: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          user_id?: string | null
          professional_id?: string | null
          full_name?: string
          role_title?: string | null
          cpf?: string | null
          contract_type?: ContractType
          hire_date?: string | null
          termination_date?: string | null
          salary_cents?: number | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'employees_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employees_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'employees_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }
      encounters: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          professional_id: string
          appointment_id: string | null
          status: EncounterStatus
          chief_complaint: string | null
          started_at: string
          ended_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          professional_id: string
          appointment_id?: string | null
          status: EncounterStatus
          chief_complaint?: string | null
          started_at: string
          ended_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          professional_id?: string
          appointment_id?: string | null
          status?: EncounterStatus
          chief_complaint?: string | null
          started_at?: string
          ended_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'encounters_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'encounters_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'encounters_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'encounters_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'encounters_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      insurance_authorizations: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          patient_insurance_id: string
          appointment_id: string | null
          authorization_number: string | null
          status: AuthorizationStatus
          procedures: Json
          requested_at: string
          answered_at: string | null
          expires_at: string | null
          denial_reason: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          patient_insurance_id: string
          appointment_id?: string | null
          authorization_number?: string | null
          status: AuthorizationStatus
          procedures: Json
          requested_at: string
          answered_at?: string | null
          expires_at?: string | null
          denial_reason?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          patient_insurance_id?: string
          appointment_id?: string | null
          authorization_number?: string | null
          status?: AuthorizationStatus
          procedures?: Json
          requested_at?: string
          answered_at?: string | null
          expires_at?: string | null
          denial_reason?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'insurance_authorizations_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'insurance_authorizations_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'insurance_authorizations_patient_insurance_id_fkey'
            columns: ['patient_insurance_id']
            isOneToOne: false
            referencedRelation: 'patient_insurances'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'insurance_authorizations_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'insurance_authorizations_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      insurance_claim_denials: {
        Row: {
          id: string
          clinic_id: string
          invoice_id: string
          invoice_item_id: string | null
          denial_code: string | null
          reason: string
          amount_cents: number
          status: ClaimDenialStatus
          denied_at: string
          appealed_at: string | null
          resolved_at: string | null
          recovered_cents: number | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          invoice_id: string
          invoice_item_id?: string | null
          denial_code?: string | null
          reason: string
          amount_cents: number
          status: ClaimDenialStatus
          denied_at: string
          appealed_at?: string | null
          resolved_at?: string | null
          recovered_cents?: number | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          invoice_id?: string
          invoice_item_id?: string | null
          denial_code?: string | null
          reason?: string
          amount_cents?: number
          status?: ClaimDenialStatus
          denied_at?: string
          appealed_at?: string | null
          resolved_at?: string | null
          recovered_cents?: number | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'insurance_claim_denials_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'insurance_claim_denials_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'insurance_claim_denials_invoice_item_id_fkey'
            columns: ['invoice_item_id']
            isOneToOne: false
            referencedRelation: 'invoice_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'insurance_claim_denials_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      insurance_plans: {
        Row: {
          id: string
          clinic_id: string
          provider_id: string
          name: string
          plan_code: string | null
          price_list_id: string | null
          copay_cents: number
          payment_term_days: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          provider_id: string
          name: string
          plan_code?: string | null
          price_list_id?: string | null
          copay_cents: number
          payment_term_days: number
          is_active: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          provider_id?: string
          name?: string
          plan_code?: string | null
          price_list_id?: string | null
          copay_cents?: number
          payment_term_days?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'insurance_plans_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'insurance_plans_provider_id_fkey'
            columns: ['provider_id']
            isOneToOne: false
            referencedRelation: 'insurance_providers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'insurance_plans_price_list_id_fkey'
            columns: ['price_list_id']
            isOneToOne: false
            referencedRelation: 'price_lists'
            referencedColumns: ['id']
          },
        ]
      }
      insurance_providers: {
        Row: {
          id: string
          clinic_id: string
          name: string
          ans_code: string | null
          cnpj: string | null
          contact: Json
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          name: string
          ans_code?: string | null
          cnpj?: string | null
          contact: Json
          notes?: string | null
          is_active: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          name?: string
          ans_code?: string | null
          cnpj?: string | null
          contact?: Json
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'insurance_providers_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      invitations: {
        Row: {
          id: string
          clinic_id: string
          email: string
          role: MembershipRole
          token_hash: string
          expires_at: string
          accepted_at: string | null
          revoked_at: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          email: string
          role: MembershipRole
          token_hash: string
          expires_at: string
          accepted_at?: string | null
          revoked_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          email?: string
          role?: MembershipRole
          token_hash?: string
          expires_at?: string
          accepted_at?: string | null
          revoked_at?: string | null
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invitations_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invitations_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      invoice_items: {
        Row: {
          id: string
          clinic_id: string
          invoice_id: string
          service_id: string | null
          description: string
          quantity: number
          unit_price_cents: number
          discount_cents: number
          total_cents: number | null
          professional_id: string | null
          professional_share_percent: number | null
          professional_share_cents: number | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          invoice_id: string
          service_id?: string | null
          description: string
          quantity: number
          unit_price_cents: number
          discount_cents: number
          total_cents?: number | null
          professional_id?: string | null
          professional_share_percent?: number | null
          professional_share_cents?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          invoice_id?: string
          service_id?: string | null
          description?: string
          quantity?: number
          unit_price_cents?: number
          discount_cents?: number
          total_cents?: number | null
          professional_id?: string | null
          professional_share_percent?: number | null
          professional_share_cents?: number | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoice_items_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_items_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_items_service_id_fkey'
            columns: ['service_id']
            isOneToOne: false
            referencedRelation: 'services'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoice_items_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }
      invoices: {
        Row: {
          id: string
          clinic_id: string
          number: number | null
          payer_type: PayerType
          patient_id: string
          insurance_plan_id: string | null
          encounter_id: string | null
          appointment_id: string | null
          status: InvoiceStatus
          issue_date: string | null
          due_date: string | null
          subtotal_cents: number
          discount_cents: number
          total_cents: number
          paid_cents: number
          notes: string | null
          canceled_at: string | null
          cancel_reason: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          number?: number | null
          payer_type: PayerType
          patient_id: string
          insurance_plan_id?: string | null
          encounter_id?: string | null
          appointment_id?: string | null
          status: InvoiceStatus
          issue_date?: string | null
          due_date?: string | null
          subtotal_cents: number
          discount_cents: number
          total_cents: number
          paid_cents: number
          notes?: string | null
          canceled_at?: string | null
          cancel_reason?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          number?: number | null
          payer_type?: PayerType
          patient_id?: string
          insurance_plan_id?: string | null
          encounter_id?: string | null
          appointment_id?: string | null
          status?: InvoiceStatus
          issue_date?: string | null
          due_date?: string | null
          subtotal_cents?: number
          discount_cents?: number
          total_cents?: number
          paid_cents?: number
          notes?: string | null
          canceled_at?: string | null
          cancel_reason?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invoices_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoices_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoices_insurance_plan_id_fkey'
            columns: ['insurance_plan_id']
            isOneToOne: false
            referencedRelation: 'insurance_plans'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoices_encounter_id_fkey'
            columns: ['encounter_id']
            isOneToOne: false
            referencedRelation: 'encounters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoices_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invoices_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      medical_records: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          encounter_id: string | null
          author_id: string
          author_user_id: string | null
          record_type: RecordType
          content: Json
          content_text: string | null
          content_hash: string
          supersedes_id: string | null
          version: number
          signed_at: string | null
          signature: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          encounter_id?: string | null
          author_id: string
          author_user_id?: string | null
          record_type: RecordType
          content: Json
          content_text?: string | null
          content_hash: string
          supersedes_id?: string | null
          version: number
          signed_at?: string | null
          signature?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          encounter_id?: string | null
          author_id?: string
          author_user_id?: string | null
          record_type?: RecordType
          content?: Json
          content_text?: string | null
          content_hash?: string
          supersedes_id?: string | null
          version?: number
          signed_at?: string | null
          signature?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'medical_records_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'medical_records_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'medical_records_encounter_id_fkey'
            columns: ['encounter_id']
            isOneToOne: false
            referencedRelation: 'encounters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'medical_records_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'medical_records_author_user_id_fkey'
            columns: ['author_user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'medical_records_supersedes_id_fkey'
            columns: ['supersedes_id']
            isOneToOne: false
            referencedRelation: 'medical_records'
            referencedColumns: ['id']
          },
        ]
      }
      memberships: {
        Row: {
          id: string
          clinic_id: string
          user_id: string
          role: MembershipRole
          status: MembershipStatus
          invited_by: string | null
          invited_at: string | null
          accepted_at: string | null
          revoked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          user_id: string
          role: MembershipRole
          status: MembershipStatus
          invited_by?: string | null
          invited_at?: string | null
          accepted_at?: string | null
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          user_id?: string
          role?: MembershipRole
          status?: MembershipStatus
          invited_by?: string | null
          invited_at?: string | null
          accepted_at?: string | null
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'memberships_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'memberships_invited_by_fkey'
            columns: ['invited_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      message_templates: {
        Row: {
          id: string
          clinic_id: string
          name: string
          category: string | null
          language: string
          body: string
          variables: Json
          provider_template_id: string | null
          is_approved: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          name: string
          category?: string | null
          language: string
          body: string
          variables: Json
          provider_template_id?: string | null
          is_approved: boolean
          is_active: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          name?: string
          category?: string | null
          language?: string
          body?: string
          variables?: Json
          provider_template_id?: string | null
          is_approved?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'message_templates_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      messages: {
        Row: {
          id: string
          clinic_id: string
          conversation_id: string
          direction: MessageDirection
          content_type: string
          body: string | null
          media_url: string | null
          provider_message_id: string | null
          status: MessageStatus
          sent_by: string | null
          is_from_ai: boolean
          error: string | null
          sent_at: string | null
          delivered_at: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          conversation_id: string
          direction: MessageDirection
          content_type: string
          body?: string | null
          media_url?: string | null
          provider_message_id?: string | null
          status: MessageStatus
          sent_by?: string | null
          is_from_ai: boolean
          error?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          conversation_id?: string
          direction?: MessageDirection
          content_type?: string
          body?: string | null
          media_url?: string | null
          provider_message_id?: string | null
          status?: MessageStatus
          sent_by?: string | null
          is_from_ai?: boolean
          error?: string | null
          sent_at?: string | null
          delivered_at?: string | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'messages_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_conversation_id_fkey'
            columns: ['conversation_id']
            isOneToOne: false
            referencedRelation: 'conversations'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'messages_sent_by_fkey'
            columns: ['sent_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          clinic_id: string
          user_id: string
          kind: string
          title: string
          body: string | null
          link: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          user_id: string
          kind: string
          title: string
          body?: string | null
          link?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          user_id?: string
          kind?: string
          title?: string
          body?: string | null
          link?: string | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'notifications_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'notifications_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      patient_contacts: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          name: string
          relationship: string | null
          phone: string | null
          email: string | null
          is_legal_guardian: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          name: string
          relationship?: string | null
          phone?: string | null
          email?: string | null
          is_legal_guardian: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          name?: string
          relationship?: string | null
          phone?: string | null
          email?: string | null
          is_legal_guardian?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'patient_contacts_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'patient_contacts_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
        ]
      }
      patient_documents: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          kind: PatientDocumentKind
          storage_path: string
          file_name: string
          mime_type: string | null
          size_bytes: number | null
          uploaded_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          kind: PatientDocumentKind
          storage_path: string
          file_name: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          kind?: PatientDocumentKind
          storage_path?: string
          file_name?: string
          mime_type?: string | null
          size_bytes?: number | null
          uploaded_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'patient_documents_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'patient_documents_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'patient_documents_uploaded_by_fkey'
            columns: ['uploaded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      patient_insurances: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          insurance_plan_id: string
          card_number: string
          holder_name: string | null
          valid_until: string | null
          is_primary: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          insurance_plan_id: string
          card_number: string
          holder_name?: string | null
          valid_until?: string | null
          is_primary: boolean
          is_active: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          insurance_plan_id?: string
          card_number?: string
          holder_name?: string | null
          valid_until?: string | null
          is_primary?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'patient_insurances_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'patient_insurances_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'patient_insurances_insurance_plan_id_fkey'
            columns: ['insurance_plan_id']
            isOneToOne: false
            referencedRelation: 'insurance_plans'
            referencedColumns: ['id']
          },
        ]
      }
      patients: {
        Row: {
          id: string
          clinic_id: string
          full_name: string
          social_name: string | null
          birth_date: string | null
          biological_sex: BiologicalSex
          gender_identity: string | null
          cpf: string | null
          cns: string | null
          phone: string | null
          phone_alt: string | null
          email: string | null
          address: Json
          emergency_contact: Json | null
          photo_url: string | null
          admin_notes: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          clinic_id: string
          full_name: string
          social_name?: string | null
          birth_date?: string | null
          biological_sex: BiologicalSex
          gender_identity?: string | null
          cpf?: string | null
          cns?: string | null
          phone?: string | null
          phone_alt?: string | null
          email?: string | null
          address: Json
          emergency_contact?: Json | null
          photo_url?: string | null
          admin_notes?: string | null
          is_active: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          clinic_id?: string
          full_name?: string
          social_name?: string | null
          birth_date?: string | null
          biological_sex?: BiologicalSex
          gender_identity?: string | null
          cpf?: string | null
          cns?: string | null
          phone?: string | null
          phone_alt?: string | null
          email?: string | null
          address?: Json
          emergency_contact?: Json | null
          photo_url?: string | null
          admin_notes?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'patients_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'patients_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      payables: {
        Row: {
          id: string
          clinic_id: string
          description: string
          category: string | null
          supplier: string | null
          amount_cents: number
          due_date: string
          paid_at: string | null
          paid_amount_cents: number | null
          method: PaymentMethod | null
          is_recurring: boolean
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          description: string
          category?: string | null
          supplier?: string | null
          amount_cents: number
          due_date: string
          paid_at?: string | null
          paid_amount_cents?: number | null
          method?: PaymentMethod | null
          is_recurring: boolean
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          description?: string
          category?: string | null
          supplier?: string | null
          amount_cents?: number
          due_date?: string
          paid_at?: string | null
          paid_amount_cents?: number | null
          method?: PaymentMethod | null
          is_recurring?: boolean
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payables_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payables_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      payments: {
        Row: {
          id: string
          clinic_id: string
          invoice_id: string
          amount_cents: number
          method: PaymentMethod
          paid_at: string
          installments: number
          external_id: string | null
          cash_session_id: string | null
          notes: string | null
          received_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          invoice_id: string
          amount_cents: number
          method: PaymentMethod
          paid_at: string
          installments: number
          external_id?: string | null
          cash_session_id?: string | null
          notes?: string | null
          received_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          invoice_id?: string
          amount_cents?: number
          method?: PaymentMethod
          paid_at?: string
          installments?: number
          external_id?: string | null
          cash_session_id?: string | null
          notes?: string | null
          received_by?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'payments_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_invoice_id_fkey'
            columns: ['invoice_id']
            isOneToOne: false
            referencedRelation: 'invoices'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_cash_session_id_fkey'
            columns: ['cash_session_id']
            isOneToOne: false
            referencedRelation: 'cash_sessions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'payments_received_by_fkey'
            columns: ['received_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      plans: {
        Row: {
          id: string
          name: string
          price_cents: number
          currency: string
          max_professionals: number | null
          max_patients: number | null
          storage_mb: number | null
          ai_tokens_month: number | null
          features: Json
          is_public: boolean
          sort_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          price_cents: number
          currency: string
          max_professionals?: number | null
          max_patients?: number | null
          storage_mb?: number | null
          ai_tokens_month?: number | null
          features: Json
          is_public: boolean
          sort_order: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          price_cents?: number
          currency?: string
          max_professionals?: number | null
          max_patients?: number | null
          storage_mb?: number | null
          ai_tokens_month?: number | null
          features?: Json
          is_public?: boolean
          sort_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      prescription_items: {
        Row: {
          id: string
          clinic_id: string
          prescription_id: string
          drug_name: string
          dosage: string | null
          route: string | null
          frequency: string | null
          duration: string | null
          quantity: string | null
          instructions: string | null
          sort_order: number
        }
        Insert: {
          id?: string
          clinic_id: string
          prescription_id: string
          drug_name: string
          dosage?: string | null
          route?: string | null
          frequency?: string | null
          duration?: string | null
          quantity?: string | null
          instructions?: string | null
          sort_order: number
        }
        Update: {
          id?: string
          clinic_id?: string
          prescription_id?: string
          drug_name?: string
          dosage?: string | null
          route?: string | null
          frequency?: string | null
          duration?: string | null
          quantity?: string | null
          instructions?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'prescription_items_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'prescription_items_prescription_id_fkey'
            columns: ['prescription_id']
            isOneToOne: false
            referencedRelation: 'prescriptions'
            referencedColumns: ['id']
          },
        ]
      }
      prescriptions: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          encounter_id: string | null
          author_id: string
          issued_at: string
          valid_until: string | null
          external_id: string | null
          external_url: string | null
          signed_at: string | null
          signature: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          encounter_id?: string | null
          author_id: string
          issued_at: string
          valid_until?: string | null
          external_id?: string | null
          external_url?: string | null
          signed_at?: string | null
          signature?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          encounter_id?: string | null
          author_id?: string
          issued_at?: string
          valid_until?: string | null
          external_id?: string | null
          external_url?: string | null
          signed_at?: string | null
          signature?: Json | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'prescriptions_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'prescriptions_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'prescriptions_encounter_id_fkey'
            columns: ['encounter_id']
            isOneToOne: false
            referencedRelation: 'encounters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'prescriptions_author_id_fkey'
            columns: ['author_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }
      price_list_items: {
        Row: {
          id: string
          clinic_id: string
          price_list_id: string
          service_id: string
          price_cents: number
          professional_share_percent: number | null
          professional_share_cents: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          price_list_id: string
          service_id: string
          price_cents: number
          professional_share_percent?: number | null
          professional_share_cents?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          price_list_id?: string
          service_id?: string
          price_cents?: number
          professional_share_percent?: number | null
          professional_share_cents?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'price_list_items_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'price_list_items_price_list_id_fkey'
            columns: ['price_list_id']
            isOneToOne: false
            referencedRelation: 'price_lists'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'price_list_items_service_id_fkey'
            columns: ['service_id']
            isOneToOne: false
            referencedRelation: 'services'
            referencedColumns: ['id']
          },
        ]
      }
      price_lists: {
        Row: {
          id: string
          clinic_id: string
          name: string
          is_default: boolean
          valid_from: string | null
          valid_until: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          name: string
          is_default: boolean
          valid_from?: string | null
          valid_until?: string | null
          is_active: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          name?: string
          is_default?: boolean
          valid_from?: string | null
          valid_until?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'price_lists_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      professional_payout_items: {
        Row: {
          id: string
          clinic_id: string
          payout_id: string
          invoice_item_id: string
          amount_cents: number
        }
        Insert: {
          id?: string
          clinic_id: string
          payout_id: string
          invoice_item_id: string
          amount_cents: number
        }
        Update: {
          id?: string
          clinic_id?: string
          payout_id?: string
          invoice_item_id?: string
          amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: 'professional_payout_items_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'professional_payout_items_payout_id_fkey'
            columns: ['payout_id']
            isOneToOne: false
            referencedRelation: 'professional_payouts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'professional_payout_items_invoice_item_id_fkey'
            columns: ['invoice_item_id']
            isOneToOne: false
            referencedRelation: 'invoice_items'
            referencedColumns: ['id']
          },
        ]
      }
      professional_payouts: {
        Row: {
          id: string
          clinic_id: string
          professional_id: string
          period_start: string
          period_end: string
          status: PayoutStatus
          gross_cents: number
          deductions_cents: number
          net_cents: number | null
          paid_at: string | null
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          professional_id: string
          period_start: string
          period_end: string
          status: PayoutStatus
          gross_cents: number
          deductions_cents: number
          net_cents?: number | null
          paid_at?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          professional_id?: string
          period_start?: string
          period_end?: string
          status?: PayoutStatus
          gross_cents?: number
          deductions_cents?: number
          net_cents?: number | null
          paid_at?: string | null
          notes?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'professional_payouts_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'professional_payouts_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'professional_payouts_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      professionals: {
        Row: {
          id: string
          clinic_id: string
          user_id: string | null
          display_name: string
          council_type: CouncilType | null
          council_number: string | null
          council_state: string | null
          specialties: string[]
          agenda_color: string | null
          default_slot_minutes: number
          is_active: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          clinic_id: string
          user_id?: string | null
          display_name: string
          council_type?: CouncilType | null
          council_number?: string | null
          council_state?: string | null
          specialties: string[]
          agenda_color?: string | null
          default_slot_minutes: number
          is_active: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          clinic_id?: string
          user_id?: string | null
          display_name?: string
          council_type?: CouncilType | null
          council_number?: string | null
          council_state?: string | null
          specialties?: string[]
          agenda_color?: string | null
          default_slot_minutes?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'professionals_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'professionals_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string
          phone: string | null
          avatar_url: string | null
          active_clinic_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          full_name: string
          email: string
          phone?: string | null
          avatar_url?: string | null
          active_clinic_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          phone?: string | null
          avatar_url?: string | null
          active_clinic_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'profiles_active_clinic_id_fkey'
            columns: ['active_clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      services: {
        Row: {
          id: string
          clinic_id: string
          code: string | null
          tuss_code: string | null
          name: string
          description: string | null
          category: string | null
          default_duration_minutes: number | null
          default_price_cents: number
          requires_authorization: boolean
          is_active: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          clinic_id: string
          code?: string | null
          tuss_code?: string | null
          name: string
          description?: string | null
          category?: string | null
          default_duration_minutes?: number | null
          default_price_cents: number
          requires_authorization: boolean
          is_active: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          id?: string
          clinic_id?: string
          code?: string | null
          tuss_code?: string | null
          name?: string
          description?: string | null
          category?: string | null
          default_duration_minutes?: number | null
          default_price_cents?: number
          requires_authorization?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'services_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      subscriptions: {
        Row: {
          id: string
          clinic_id: string
          plan_id: string
          status: SubscriptionStatus
          trial_ends_at: string | null
          current_period_start: string | null
          current_period_end: string | null
          provider: string | null
          provider_subscription_id: string | null
          canceled_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          plan_id: string
          status: SubscriptionStatus
          trial_ends_at?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          provider?: string | null
          provider_subscription_id?: string | null
          canceled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          plan_id?: string
          status?: SubscriptionStatus
          trial_ends_at?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          provider?: string | null
          provider_subscription_id?: string | null
          canceled_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subscriptions_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'plans'
            referencedColumns: ['id']
          },
        ]
      }
      time_off: {
        Row: {
          id: string
          clinic_id: string
          employee_id: string
          kind: TimeOffKind
          status: TimeOffStatus
          starts_on: string
          ends_on: string
          reason: string | null
          approved_by: string | null
          approved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          employee_id: string
          kind: TimeOffKind
          status: TimeOffStatus
          starts_on: string
          ends_on: string
          reason?: string | null
          approved_by?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          employee_id?: string
          kind?: TimeOffKind
          status?: TimeOffStatus
          starts_on?: string
          ends_on?: string
          reason?: string | null
          approved_by?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'time_off_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'time_off_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'time_off_approved_by_fkey'
            columns: ['approved_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      vitals: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          encounter_id: string | null
          measured_at: string
          weight_kg: number | null
          height_cm: number | null
          systolic_bp: number | null
          diastolic_bp: number | null
          heart_rate: number | null
          respiratory_rate: number | null
          temperature_c: number | null
          spo2: number | null
          glucose_mgdl: number | null
          notes: string | null
          recorded_by: string | null
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          encounter_id?: string | null
          measured_at: string
          weight_kg?: number | null
          height_cm?: number | null
          systolic_bp?: number | null
          diastolic_bp?: number | null
          heart_rate?: number | null
          respiratory_rate?: number | null
          temperature_c?: number | null
          spo2?: number | null
          glucose_mgdl?: number | null
          notes?: string | null
          recorded_by?: string | null
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          encounter_id?: string | null
          measured_at?: string
          weight_kg?: number | null
          height_cm?: number | null
          systolic_bp?: number | null
          diastolic_bp?: number | null
          heart_rate?: number | null
          respiratory_rate?: number | null
          temperature_c?: number | null
          spo2?: number | null
          glucose_mgdl?: number | null
          notes?: string | null
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'vitals_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'vitals_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'vitals_encounter_id_fkey'
            columns: ['encounter_id']
            isOneToOne: false
            referencedRelation: 'encounters'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'vitals_recorded_by_fkey'
            columns: ['recorded_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      waiting_queue: {
        Row: {
          id: string
          clinic_id: string
          patient_id: string
          appointment_id: string | null
          professional_id: string | null
          priority: number
          status: QueueStatus
          reason: string | null
          arrived_at: string
          called_at: string | null
          started_at: string | null
          finished_at: string | null
        }
        Insert: {
          id?: string
          clinic_id: string
          patient_id: string
          appointment_id?: string | null
          professional_id?: string | null
          priority: number
          status: QueueStatus
          reason?: string | null
          arrived_at: string
          called_at?: string | null
          started_at?: string | null
          finished_at?: string | null
        }
        Update: {
          id?: string
          clinic_id?: string
          patient_id?: string
          appointment_id?: string | null
          professional_id?: string | null
          priority?: number
          status?: QueueStatus
          reason?: string | null
          arrived_at?: string
          called_at?: string | null
          started_at?: string | null
          finished_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'waiting_queue_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'waiting_queue_patient_id_fkey'
            columns: ['patient_id']
            isOneToOne: false
            referencedRelation: 'patients'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'waiting_queue_appointment_id_fkey'
            columns: ['appointment_id']
            isOneToOne: false
            referencedRelation: 'appointments'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'waiting_queue_professional_id_fkey'
            columns: ['professional_id']
            isOneToOne: false
            referencedRelation: 'professionals'
            referencedColumns: ['id']
          },
        ]
      }
      whatsapp_channels: {
        Row: {
          id: string
          clinic_id: string
          display_name: string
          phone_number: string
          provider: ChannelProvider
          provider_config: Json
          is_active: boolean
          connected_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          display_name: string
          phone_number: string
          provider: ChannelProvider
          provider_config: Json
          is_active: boolean
          connected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          display_name?: string
          phone_number?: string
          provider?: ChannelProvider
          provider_config?: Json
          is_active?: boolean
          connected_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'whatsapp_channels_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
        ]
      }
      work_schedules: {
        Row: {
          id: string
          clinic_id: string
          employee_id: string
          weekday: number
          start_time: string
          end_time: string
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          employee_id: string
          weekday: number
          start_time: string
          end_time: string
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          employee_id?: string
          weekday?: number
          start_time?: string
          end_time?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'work_schedules_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'work_schedules_employee_id_fkey'
            columns: ['employee_id']
            isOneToOne: false
            referencedRelation: 'employees'
            referencedColumns: ['id']
          },
        ]
      }
      workflow_runs: {
        Row: {
          id: string
          clinic_id: string
          workflow_id: string
          status: WorkflowRunStatus
          trigger_payload: Json
          result: Json | null
          error: string | null
          attempt: number
          dedupe_key: string | null
          started_at: string | null
          finished_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          workflow_id: string
          status: WorkflowRunStatus
          trigger_payload: Json
          result?: Json | null
          error?: string | null
          attempt: number
          dedupe_key?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          workflow_id?: string
          status?: WorkflowRunStatus
          trigger_payload?: Json
          result?: Json | null
          error?: string | null
          attempt?: number
          dedupe_key?: string | null
          started_at?: string | null
          finished_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workflow_runs_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'workflow_runs_workflow_id_fkey'
            columns: ['workflow_id']
            isOneToOne: false
            referencedRelation: 'workflows'
            referencedColumns: ['id']
          },
        ]
      }
      workflows: {
        Row: {
          id: string
          clinic_id: string
          name: string
          description: string | null
          trigger_type: WorkflowTrigger
          trigger_config: Json
          conditions: Json
          actions: Json
          is_active: boolean
          last_run_at: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          clinic_id: string
          name: string
          description?: string | null
          trigger_type: WorkflowTrigger
          trigger_config: Json
          conditions: Json
          actions: Json
          is_active: boolean
          last_run_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          clinic_id?: string
          name?: string
          description?: string | null
          trigger_type?: WorkflowTrigger
          trigger_config?: Json
          conditions?: Json
          actions?: Json
          is_active?: boolean
          last_run_at?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'workflows_clinic_id_fkey'
            columns: ['clinic_id']
            isOneToOne: false
            referencedRelation: 'clinics'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'workflows_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      v_medical_records_current: {
        Row: {
          id: string | null
          clinic_id: string | null
          patient_id: string | null
          encounter_id: string | null
          author_id: string | null
          author_user_id: string | null
          record_type: RecordType | null
          content: Json | null
          content_text: string | null
          content_hash: string | null
          supersedes_id: string | null
          version: number | null
          signed_at: string | null
          signature: Json | null
          created_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: {
        Args: { p_token: string }
        Returns: string
      }
      ai_usage_current_period: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      can_access_clinical: {
        Args: Record<string, never>
        Returns: boolean
      }
      can_access_financial: {
        Args: Record<string, never>
        Returns: boolean
      }
      can_handle_billing: {
        Args: Record<string, never>
        Returns: boolean
      }
      close_cash_session: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      create_clinic: {
        Args: { p_slug: string; p_trade_name: string }
        Returns: ClinicRow
      }
      create_invitation: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      current_clinic_id: {
        Args: Record<string, never>
        Returns: string | null
      }
      current_clinic_role: {
        Args: Record<string, never>
        Returns: MembershipRole | null
      }
      current_professional_id: {
        Args: Record<string, never>
        Returns: string | null
      }
      custom_access_token_hook: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      has_clinic_role: {
        Args: { p_roles: MembershipRole[] }
        Returns: boolean
      }
      is_active_member: {
        Args: { p_clinic: string }
        Returns: boolean
      }
      issue_invoice: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      log_clinical_access: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      next_document_number: {
        Args: { p_kind: string }
        Returns: number
      }
      preview_professional_payout: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      search_clinic_knowledge: {
        Args: Record<string, unknown>
        Returns: unknown
      }
      switch_clinic: {
        Args: { p_clinic_id: string }
        Returns: undefined
      }
    }
    Enums: {
      ai_feature: AiFeature
      ai_role: AiRole
      appointment_status: AppointmentStatus
      authorization_status: AuthorizationStatus
      availability_kind: AvailabilityKind
      biological_sex: BiologicalSex
      cash_entry_kind: CashEntryKind
      cash_session_status: CashSessionStatus
      channel_provider: ChannelProvider
      claim_denial_status: ClaimDenialStatus
      clinic_status: ClinicStatus
      consent_purpose: ConsentPurpose
      contract_type: ContractType
      conversation_status: ConversationStatus
      council_type: CouncilType
      encounter_status: EncounterStatus
      invoice_status: InvoiceStatus
      membership_role: MembershipRole
      membership_status: MembershipStatus
      message_direction: MessageDirection
      message_status: MessageStatus
      patient_document_kind: PatientDocumentKind
      payer_type: PayerType
      payment_method: PaymentMethod
      payout_status: PayoutStatus
      queue_status: QueueStatus
      record_type: RecordType
      subscription_status: SubscriptionStatus
      time_off_kind: TimeOffKind
      time_off_status: TimeOffStatus
      workflow_run_status: WorkflowRunStatus
      workflow_trigger: WorkflowTrigger
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// ---------------------------------------------------------------------------
// Atalhos de linha (usados pelos mappers de cada modulo)
// ---------------------------------------------------------------------------
export type AiConversationRow = Database['public']['Tables']['ai_conversations']['Row']
export type AiMessageRow = Database['public']['Tables']['ai_messages']['Row']
export type AiUsageLogRow = Database['public']['Tables']['ai_usage_log']['Row']
export type AllergyRow = Database['public']['Tables']['allergies']['Row']
export type AppointmentStatusHistoryRow = Database['public']['Tables']['appointment_status_history']['Row']
export type AppointmentRow = Database['public']['Tables']['appointments']['Row']
export type AuditLogRow = Database['public']['Tables']['audit_log']['Row']
export type AvailabilityExceptionRow = Database['public']['Tables']['availability_exceptions']['Row']
export type AvailabilityRuleRow = Database['public']['Tables']['availability_rules']['Row']
export type CashEntryRow = Database['public']['Tables']['cash_entries']['Row']
export type CashSessionRow = Database['public']['Tables']['cash_sessions']['Row']
export type ClinicSettingRow = Database['public']['Tables']['clinic_settings']['Row']
export type ClinicIntegrationCredentialRow = Database['public']['Tables']['clinic_integration_credentials']['Row']
export type ClinicalAttachmentRow = Database['public']['Tables']['clinical_attachments']['Row']
export type ClinicRow = Database['public']['Tables']['clinics']['Row']
export type ConsentRow = Database['public']['Tables']['consents']['Row']
export type ConversationRow = Database['public']['Tables']['conversations']['Row']
export type DocumentEmbeddingRow = Database['public']['Tables']['document_embeddings']['Row']
export type DocumentSequenceRow = Database['public']['Tables']['document_sequences']['Row']
export type EmployeeRow = Database['public']['Tables']['employees']['Row']
export type EncounterRow = Database['public']['Tables']['encounters']['Row']
export type InsuranceAuthorizationRow = Database['public']['Tables']['insurance_authorizations']['Row']
export type InsuranceClaimDenialRow = Database['public']['Tables']['insurance_claim_denials']['Row']
export type InsurancePlanRow = Database['public']['Tables']['insurance_plans']['Row']
export type InsuranceProviderRow = Database['public']['Tables']['insurance_providers']['Row']
export type InvitationRow = Database['public']['Tables']['invitations']['Row']
export type InvoiceItemRow = Database['public']['Tables']['invoice_items']['Row']
export type InvoiceRow = Database['public']['Tables']['invoices']['Row']
export type MedicalRecordRow = Database['public']['Tables']['medical_records']['Row']
export type MembershipRow = Database['public']['Tables']['memberships']['Row']
export type MessageTemplateRow = Database['public']['Tables']['message_templates']['Row']
export type MessageRow = Database['public']['Tables']['messages']['Row']
export type NotificationRow = Database['public']['Tables']['notifications']['Row']
export type PatientContactRow = Database['public']['Tables']['patient_contacts']['Row']
export type PatientDocumentRow = Database['public']['Tables']['patient_documents']['Row']
export type PatientInsuranceRow = Database['public']['Tables']['patient_insurances']['Row']
export type PatientRow = Database['public']['Tables']['patients']['Row']
export type PayableRow = Database['public']['Tables']['payables']['Row']
export type PaymentRow = Database['public']['Tables']['payments']['Row']
export type PlanRow = Database['public']['Tables']['plans']['Row']
export type PrescriptionItemRow = Database['public']['Tables']['prescription_items']['Row']
export type PrescriptionRow = Database['public']['Tables']['prescriptions']['Row']
export type PriceListItemRow = Database['public']['Tables']['price_list_items']['Row']
export type PriceListRow = Database['public']['Tables']['price_lists']['Row']
export type ProfessionalPayoutItemRow = Database['public']['Tables']['professional_payout_items']['Row']
export type ProfessionalPayoutRow = Database['public']['Tables']['professional_payouts']['Row']
export type ProfessionalRow = Database['public']['Tables']['professionals']['Row']
export type ProfileRow = Database['public']['Tables']['profiles']['Row']
export type ServiceRow = Database['public']['Tables']['services']['Row']
export type SubscriptionRow = Database['public']['Tables']['subscriptions']['Row']
export type TimeOffRow = Database['public']['Tables']['time_off']['Row']
export type VitalRow = Database['public']['Tables']['vitals']['Row']
export type WaitingQueueRow = Database['public']['Tables']['waiting_queue']['Row']
export type WhatsappChannelRow = Database['public']['Tables']['whatsapp_channels']['Row']
export type WorkScheduleRow = Database['public']['Tables']['work_schedules']['Row']
export type WorkflowRunRow = Database['public']['Tables']['workflow_runs']['Row']
export type WorkflowRow = Database['public']['Tables']['workflows']['Row']
