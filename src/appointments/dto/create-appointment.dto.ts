export class CreateAppointmentDto {
  businessId: string;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  date: string | Date;
  spreadsheetId?: string;
}

