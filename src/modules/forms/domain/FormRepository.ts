import type { Form, FormStatus, FormUpdateData, NewFormData } from './Form'

export interface FormRepository {
  list(clinicId: string): Promise<Form[]>
  findById(clinicId: string, formId: string): Promise<Form | null>
  create(clinicId: string, createdBy: string, data: NewFormData): Promise<Form>
  update(
    clinicId: string,
    formId: string,
    updatedBy: string,
    data: FormUpdateData,
  ): Promise<Form>
  setStatus(
    clinicId: string,
    formId: string,
    updatedBy: string,
    status: FormStatus,
  ): Promise<Form>
}
