import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { AuthModule } from '../auth/auth.module';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [TenantsModule, AuthModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
