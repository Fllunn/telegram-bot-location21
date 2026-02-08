import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ collection: 'admins', timestamps: true })
export class Admin extends Document {
  @Prop({ type: Number, required: true, unique: true })
  userId!: number;
}

export const AdminSchema = SchemaFactory.createForClass(Admin);
