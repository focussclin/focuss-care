export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type ClinicRole =
  | 'owner'
  | 'admin'
  | 'professional'
  | 'receptionist'
  | 'finance'

export type MembershipStatus = 'invited' | 'active' | 'suspended' | 'revoked'
export type PatientBiologicalSex = 'female' | 'male' | 'intersex' | 'not_informed'
export type AppointmentStatusRow =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'canceled'
  | 'no_show'

type Table<Row, Insert, Update, Relationships extends readonly unknown[] = []> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: Relationships
}

export type ClinicRow = Database['public']['Tables']['clinics']['Row']
export type MembershipRow = Database['public']['Tables']['memberships']['Row']
export type PatientRow = Database['public']['Tables']['patients']['Row']
export type ProfessionalRow = Database['public']['Tables']['professionals']['Row']
export type AppointmentRow = Database['public']['Tables']['appointments']['Row']

export type Database = {
  public: {
    Tables: {
      clinics: Table<
        {
          id: string
          slug: string
          trade_name: string
          legal_name: string | null
          cnpj: string | null
          status: Database['public']['Enums']['clinic_status']
          timezone: string
          locale: string
          logo_url: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        },
        {
          id?: string
          slug: string
          trade_name: string
          legal_name?: string | null
          cnpj?: string | null
          status?: Database['public']['Enums']['clinic_status']
          timezone?: string
          locale?: string
          logo_url?: string | null
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        },
        Partial<{
          id: string
          slug: string
          trade_name: string
          legal_name: string | null
          cnpj: string | null
          status: Database['public']['Enums']['clinic_status']
          timezone: string
          locale: string
          logo_url: string | null
          created_at: string
          updated_at: string
          deleted_at: string | null
        }>
      >
      memberships: Table<
        {
          id: string
          clinic_id: string
          user_id: string
          role: Database['public']['Enums']['membership_role']
          status: Database['public']['Enums']['membership_status']
          invited_by: string | null
          invited_at: string | null
          accepted_at: string | null
          revoked_at: string | null
          created_at: string
          updated_at: string
        },
        {
          id?: string
          clinic_id: string
          user_id: string
          role: Database['public']['Enums']['membership_role']
          status?: Database['public']['Enums']['membership_status']
          invited_by?: string | null
          invited_at?: string | null
          accepted_at?: string | null
          revoked_at?: string | null
          created_at?: string
          updated_at?: string
        },
        Partial<{
          id: string
          clinic_id: string
          user_id: string
          role: Database['public']['Enums']['membership_role']
          status: Database['public']['Enums']['membership_status']
          invited_by: string | null
          invited_at: string | null
          accepted_at: string | null
          revoked_at: string | null
          created_at: string
          updated_at: string
        }>
      >
      profiles: Table<
        {
          id: string
          full_name: string
          email: string
          phone: string | null
          avatar_url: string | null
          active_clinic_id: string | null
          created_at: string
          updated_at: string
        },
        {
          id: string
          full_name: string
          email: string
          phone?: string | null
          avatar_url?: string | null
          active_clinic_id?: string | null
          created_at?: string
          updated_at?: string
        },
        Partial<{
          id: string
          full_name: string
          email: string
          phone: string | null
          avatar_url: string | null
          active_clinic_id: string | null
          created_at: string
          updated_at: string
        }>
      >
      patients: Table<
        {
          id: string
          clinic_id: string
          full_name: string
          social_name: string | null
          birth_date: string | null
          biological_sex: Database['public']['Enums']['biological_sex']
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
        },
        {
          id?: string
          clinic_id: string
          full_name: string
          social_name?: string | null
          birth_date?: string | null
          biological_sex?: Database['public']['Enums']['biological_sex']
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
        },
        Partial<{
          id: string
          clinic_id: string
          full_name: string
          social_name: string | null
          birth_date: string | null
          biological_sex: Database['public']['Enums']['biological_sex']
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
        }>
      >
      professionals: Table<
        {
          id: string
          clinic_id: string
          user_id: string | null
          display_name: string
          council_type: Database['public']['Enums']['council_type'] | null
          council_number: string | null
          council_state: string | null
          specialties: string[]
          agenda_color: string | null
          default_slot_minutes: number
          is_active: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        },
        {
          id?: string
          clinic_id: string
          user_id?: string | null
          display_name: string
          council_type?: Database['public']['Enums']['council_type'] | null
          council_number?: string | null
          council_state?: string | null
          specialties?: string[]
          agenda_color?: string | null
          default_slot_minutes?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        },
        Partial<{
          id: string
          clinic_id: string
          user_id: string | null
          display_name: string
          council_type: Database['public']['Enums']['council_type'] | null
          council_number: string | null
          council_state: string | null
          specialties: string[]
          agenda_color: string | null
          default_slot_minutes: number
          is_active: boolean
          created_at: string
          updated_at: string
          deleted_at: string | null
        }>
      >
      appointments: Table<
        {
          id: string
          clinic_id: string
          patient_id: string
          professional_id: string
          status: Database['public']['Enums']['appointment_status']
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
        },
        {
          id?: string
          clinic_id: string
          patient_id: string
          professional_id: string
          status?: Database['public']['Enums']['appointment_status']
          starts_at: string
          ends_at: string
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
        },
        Partial<{
          id: string
          clinic_id: string
          patient_id: string
          professional_id: string
          status: Database['public']['Enums']['appointment_status']
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
        }>
      >
    }
    Views: Record<string, never>
    Functions: {
      current_clinic_id: { Args: never; Returns: string }
      current_clinic_role: {
        Args: never
        Returns: Database['public']['Enums']['membership_role']
      }
      switch_clinic: { Args: { p_clinic_id: string }; Returns: undefined }
    }
    Enums: {
      clinic_status: 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled'
      membership_role: ClinicRole
      membership_status: MembershipStatus
      biological_sex: PatientBiologicalSex
      appointment_status: AppointmentStatusRow
      council_type:
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
    }
    CompositeTypes: Record<string, never>
  }
}
