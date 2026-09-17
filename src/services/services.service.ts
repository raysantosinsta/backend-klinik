import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async create(createServiceDto: CreateServiceDto) {
    return this.prisma.service.create({
      data: {
        name: createServiceDto.name,
        description: createServiceDto.description,
        durationInMinutes: createServiceDto.durationInMinutes,
        price: createServiceDto.price,
        businessId: createServiceDto.businessId,
      },
    });
  }

  async findAll() {
    return this.prisma.service.findMany();
  }

  async findByBusinessId(businessId: string) {
    return this.prisma.service.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, updateServiceDto: UpdateServiceDto) {
    return this.prisma.service.update({
      where: { id },
      data: updateServiceDto,
    });
  }

  async remove(id: string) {
    return this.prisma.service.delete({
      where: { id },
    });
  }
}
