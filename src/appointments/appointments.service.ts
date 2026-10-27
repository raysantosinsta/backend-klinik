import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    private prisma: PrismaService,
    private webhooksService: WebhooksService,
  ) {}

  async findAll(businessId: string) {
    return this.prisma.appointment.findMany({
      where: { businessId },
      include: {
        service: true,
      },
      orderBy: {
        date: 'desc',
      },
    });
  }

  async create(dto: CreateAppointmentDto) {
    this.logger.log(`📅 [Novo Agendamento] Recebido: ${dto.clientName} - ${dto.serviceName} (${dto.date})`);

    // Busca o negócio por ID ou por evolutionInstanceName
    const business = await this.prisma.business.findFirst({
      where: {
        OR: [
          { id: dto.businessId },
          { evolutionInstanceName: dto.businessId },
        ],
      },
    });

    if (!business) {
      throw new NotFoundException(`Empresa não encontrada para o identificador: ${dto.businessId}`);
    }

    // Busca o serviço pelo nome na empresa, ou cria automaticamente se ainda não existir
    let service = await this.prisma.service.findFirst({
      where: {
        businessId: business.id,
        name: { contains: dto.serviceName, mode: 'insensitive' },
      },
    });

    if (!service) {
      this.logger.log(`ℹ️ Serviço "${dto.serviceName}" não encontrado previamente. Cadastrando na empresa...`);
      service = await this.prisma.service.create({
        data: {
          businessId: business.id,
          name: dto.serviceName,
          durationInMinutes: 60,
          price: 0,
        },
      });
    }

    // Converte a data
    let appointmentDate = new Date(dto.date);
    if (isNaN(appointmentDate.getTime())) {
      appointmentDate = new Date();
    }

    // Salva o agendamento no Prisma
    const appointment = await this.prisma.appointment.create({
      data: {
        businessId: business.id,
        clientName: dto.clientName,
        clientPhone: dto.clientPhone,
        serviceId: service.id,
        date: appointmentDate,
        status: 'CONFIRMED',
      },
      include: {
        service: true,
        business: true,
      },
    });

    this.logger.log(`✅ [Agendamento Criado] ID: ${appointment.id} | Status: ${appointment.status}`);

    // Prepara e dispara o Webhook para a Planilha do Google Sheets (ou n8n/Make/ERP)
    const targetSpreadsheetId = dto.spreadsheetId || (business as any).googleSheetsId || undefined;
    const webhookPayload = {
      event: 'appointment.confirmed',
      id: appointment.id,
      businessId: business.id,
      businessName: business.name,
      spreadsheetId: targetSpreadsheetId,
      clientName: appointment.clientName,
      clientPhone: appointment.clientPhone,
      serviceName: appointment.service.name,
      servicePrice: appointment.service.price,
      serviceDuration: appointment.service.durationInMinutes,
      date: appointment.date.toISOString(),
      dateFormatted: appointment.date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      status: appointment.status,
      createdAt: appointment.createdAt.toISOString(),
    };

    const webhookResult = await this.webhooksService.dispatchGoogleSheetsWebhook(webhookPayload);

    return {
      success: true,
      appointment,
      webhookDispatched: webhookResult.sent,
    };
  }

  async updateStatus(id: string, status: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id },
    });

    if (!appointment) {
      throw new NotFoundException('Agendamento não encontrado');
    }

    const updated = await this.prisma.appointment.update({
      where: { id },
      data: { status },
      include: {
        service: true,
        business: true,
      },
    });

    // Se o status foi alterado para confirmado, dispara o webhook
    if (status === 'CONFIRMED') {
      const webhookPayload = {
        event: 'appointment.confirmed',
        id: updated.id,
        businessId: updated.businessId,
        businessName: updated.business.name,
        spreadsheetId: (updated.business as any).googleSheetsId || undefined,
        clientName: updated.clientName,
        clientPhone: updated.clientPhone,
        serviceName: updated.service.name,
        servicePrice: updated.service.price,
        serviceDuration: updated.service.durationInMinutes,
        date: updated.date.toISOString(),
        dateFormatted: updated.date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
      };
      await this.webhooksService.dispatchGoogleSheetsWebhook(webhookPayload);
    }

    return updated;
  }
}
