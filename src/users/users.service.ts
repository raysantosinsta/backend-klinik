import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async registerUser(id: string, email: string, name: string, businessName: string) {
    // Verificar se usuário já existe
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Usuário já cadastrado');
    }

    // Criar Business e User na mesma transação
    const result = await this.prisma.$transaction(async (tx) => {
      const business = await tx.business.create({
        data: { name: businessName },
      });

      const user = await tx.user.create({
        data: {
          id,
          email,
          name,
          businessId: business.id,
        },
      });

      return { user, business };
    });

    return result;
  }

  async getUserProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { business: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }
}
