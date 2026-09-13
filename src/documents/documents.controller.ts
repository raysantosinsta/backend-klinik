import { Controller, Post, UseInterceptors, UploadedFile, Body, BadRequestException, Get, Param, Delete } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('businessId') businessId: string
  ) {
    if (!file) {
      throw new BadRequestException('Nenhum arquivo enviado.');
    }
    if (!businessId) {
      throw new BadRequestException('businessId não fornecido.');
    }

    return this.documentsService.upload(file, businessId);
  }

  @Get(':businessId')
  async listDocuments(@Param('businessId') businessId: string) {
    return this.documentsService.listDocuments(businessId);
  }

  @Delete(':id')
  async deleteDocument(@Param('id') id: string) {
    return this.documentsService.deleteDocument(id);
  }
}
