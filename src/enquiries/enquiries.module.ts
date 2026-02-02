import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnquiryMember, EnquiryMemberSchema } from './schemas/enquiry-member.schema';
import { EnquiryFollowUp, EnquiryFollowUpSchema } from './schemas/enquiry-followup.schema';
import { EnquiriesService } from './enquiries.service';
import { EnquiriesController } from './enquiries.controller';
import { MembersModule } from '../members/members.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EnquiryMember.name, schema: EnquiryMemberSchema },
      { name: EnquiryFollowUp.name, schema: EnquiryFollowUpSchema },
    ]),
    MembersModule,
  ],
  controllers: [EnquiriesController],
  providers: [EnquiriesService],
  exports: [EnquiriesService],
})
export class EnquiriesModule {}
