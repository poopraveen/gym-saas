import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'counters', timestamps: false })
export class Counter {
  @Prop({ required: true, unique: true })
  _id: string;

  @Prop({ default: 0 })
  seq: number;
}

export const CounterSchema = SchemaFactory.createForClass(Counter);
