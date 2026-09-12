export class CreateServiceDto {
  name: string;
  description?: string;
  durationInMinutes: number;
  price: number;
  businessId: string;
}
