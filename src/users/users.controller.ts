import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  async registerUser(
    @Body('id') id: string,
    @Body('email') email: string,
    @Body('name') name: string,
    @Body('businessName') businessName: string,
  ) {
    return this.usersService.registerUser(id, email, name, businessName);
  }

  @Get('me/:id')
  async getProfile(@Param('id') id: string) {
    return this.usersService.getUserProfile(id);
  }
}
