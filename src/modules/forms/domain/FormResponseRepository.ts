import type {
  FormResponse,
  FormResponseUpdateData,
  NewFormResponseData,
} from './FormResponse'

export interface FormResponseRepository {
  create(
    clinicId: string,
    createdBy: string,
    data: NewFormResponseData,
  ): Promise<FormResponse>
  update(
    clinicId: string,
    responseId: string,
    formId: string,
    data: FormResponseUpdateData,
  ): Promise<FormResponse>
}
