import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const businessId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  
  const business = await prisma.business.upsert({
    where: { id: businessId },
    update: {},
    create: {
      id: businessId,
      name: 'Klinik Teste',
    },
  })
  
  console.log('Business criado/verificado:', business.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
