import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AtlasMembersService } from './atlas-members.service';
import { AtlasMembersController } from './atlas-members.controller';

@Module({
  imports: [ConfigModule],
  controllers: [AtlasMembersController],
  providers: [AtlasMembersService],
  exports: [AtlasMembersService],
})
export class AtlasMembersModule {}
