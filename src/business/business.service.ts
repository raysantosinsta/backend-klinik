import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BusinessService {
  constructor(private prisma: PrismaService) {}

  async updateOwnerPhone(id: string, ownerPhone: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
    });

    if (!business) {
      throw new NotFoundException('Negócio não encontrado');
    }

    return this.prisma.business.update({
      where: { id },
      data: { ownerPhone },
    });
  }

  async getBusiness(id: string) {
    const business = await this.prisma.business.findUnique({
      where: { id },
    });

    if (!business) {
      throw new NotFoundException('Negócio não encontrado');
    }

    return business;
  }
}
