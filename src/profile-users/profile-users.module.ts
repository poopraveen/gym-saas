import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProfileUser, ProfileUserSchema } from './schemas/profile-user.schema';
import { ProfileUsersService } from './profile-users.service';
import { ProfileUsersController } from './profile-users.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ProfileUser.name, schema: ProfileUserSchema },
    ]),
  ],
  controllers: [ProfileUsersController],
  providers: [ProfileUsersService],
  exports: [ProfileUsersService],
})
export class ProfileUsersModule {}
